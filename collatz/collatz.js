// Helper: Convert Polar to Cartesian coordinates
function polarToCartesian(cx, cy, r, degrees) {
    let radians = degrees * Math.PI / 180;
    return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}
// Helper: Generate SVG Path string for an arc
function describeArc(cx, cy, r, startAngle, endAngle) {
    let start = polarToCartesian(cx, cy, r, startAngle), end = polarToCartesian(cx, cy, r, endAngle);    
    // Sweep flag is 1 for increasing angle (CW rendering in SVG coords)
    let sweepFlag = 0, sweepAngle = Math.abs(endAngle - startAngle), largeArcFlag = sweepAngle <= 180 ? 0 : 1;
    return [ "M", start.x, start.y, "A", r, r, 0, largeArcFlag, sweepFlag, end.x, end.y
    ].join(" ");
}

const setAttributes = (el, attrs) => Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
const geValue = (id) => document.getElementById(id).value;
const getInt = (id) => parseInt(geValue(id));

function drawGraph() {
    const max_gen   = getInt('in_max_gen');
    const unit_len  = getInt('in_unit_len');
    const thickness = getInt('in_thickness');
    const font_size = getInt('in_font_size');
    const truncate  = getInt('truncate');
    const position  = geValue('position');
    const middle    = geValue('middle');
    const color_straight = geValue('color_straight');
    const color_arc      = geValue('color_arc');
    let nodes = [], edges = [];

    // Queue elements: { n: BigInt, dist: int, angle: float, cw_bound: float }
    // cw_bound maintains the available angle space partitioned by previous branches
    let queue = [{ n: 2n, dist: 0, angle: 0, cw_bound: 360 }];

    while (queue.length > 0) {
        let current = queue.shift();
        
        let n_mod_3 = Number(current.n % 3n);
        current.n_mod_3 = n_mod_3;
        nodes.push(current);

        // Stop expanding this branch if we truncate at multiples of 3
        if (!n_mod_3 && truncate && (truncate==1 || !(current.n & 1n))) continue;

        let n_minus_1 = current.n - 1n;
        let new_cw_bound = current.cw_bound;

        // Check for valid 3n+1 reverse child
        if (n_minus_1 % 3n === 0n) {
            let m = n_minus_1 / 3n;
            // Validate Collatz rules: must be odd (and we DON'T skip 1)
            if (m & 1n) {
                let m_mod_3 = m % 3n, t = middle;
                // Place arc child. For multiples of 3, depending on "position" setting.
                if (!m_mod_3 && position!="middle")
                        if (position=="end") t = 0.85; // TODO: better formula to avoid getting too close
                        else if (truncate) t = 0.15; // only if truncated. TODO: as above
                let child3_angle = current.angle + (current.cw_bound - current.angle)*t;
                let child3 = { n: m, dist: current.dist, angle: child3_angle, cw_bound: current.cw_bound };
                edges.push({ type: 'arc', source: child3, target: current, dist: current.dist });
                queue.push(child3);
                // Update boundary for the radial ray
                // if not multiple of 3, or not truncated, and not for m=1
                if ((m_mod_3 || !truncate) && m > 1n) new_cw_bound = child3_angle; 
            }
            else if (!m) continue; // That was n = 1: don't generate *2 child!
        }

        // Generate radial *2 child
        if (current.dist < max_gen) {
            let child2 = { n: current.n * 2n, dist: current.dist + 1, angle: current.angle, 
                cw_bound: new_cw_bound // Uses updated boundary if an arc branched off
            };
            queue.push(child2);
            edges.push({ type: 'straight', source: child2, target: current });
        }
    }

    // --- Render SVG ---
    const svg = document.getElementById('canvas'); svg.innerHTML = '';
    
    // Calculate necessary canvas dimensions based on maximum radius
    const R_max = (max_gen + 1.5) * unit_len;
    const cx = R_max, cy = R_max;
    setAttributes(svg, {width: R_max * 2, height: R_max * 2});

    const node_radius = Math.max(12, font_size * 0.85);
    // Compute ideal arrow offsets based on node radius
    // refX sets the offset of the arrowhead from the exact target coordinate
    //const refX = 10 + node_radius + thickness; 

    // Create SVG definitions for Arrowheads
        // NOTE: changed M 0 0 to M 0 1; L 0 10 to L 0 9; markerWidth/Height=7 to 12.
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const stuff = ` viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse"
            markerWidth="12" markerHeight="12" orient="auto"> <path d="M 0 1 L 10 5 L 0 9 z" `
    defs.innerHTML = `
        <marker id="arrow_straight" ${stuff} fill="${color_straight}" /></marker>
        <marker id="arrow_arc"      ${stuff} fill="${color_arc}"      /></marker>
    `;
    svg.appendChild(defs);

    const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(edgeGroup); svg.appendChild(nodeGroup);

// Draw Edges
    edges.forEach(edge => {
        // The visual boundary of the target node
        let target_boundary_dist = node_radius + thickness / 2;
    
        if (edge.type === 'straight') {
            // Straight lines go inward. We stop the target radius early.
            let R_source = edge.source.dist * unit_len;
            let R_target = edge.target.dist * unit_len + target_boundary_dist;
            let p1 = polarToCartesian(cx, cy, R_source, edge.source.angle);
            let p2 = polarToCartesian(cx, cy, R_target, edge.target.angle);
            
            let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            setAttributes(line, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'edge-straight',
                stroke: color_straight, 'stroke-width': thickness, 'marker-end': 'url(#arrow_straight)' });
            edgeGroup.appendChild(line);    
        } else {
            // Arcs run along the circumference of a circle. We stop the angle early.
            let R = edge.dist * unit_len;        
            let offset_rad = target_boundary_dist / R; 
            let offset_deg = offset_rad * 180 / Math.PI;
            
            // Because source angle > target angle, we ADD the offset to stop early
            let endAngle = edge.target.angle + offset_deg;
            
            // FIX: Prevent offset overshoot! If the offset is longer than the arc itself, 
            // cap it so SVG doesn't draw backwards around an alternate center.
            if (endAngle >= edge.source.angle) {
                endAngle = edge.source.angle - 0.1; 
            }

            let d = describeArc(cx, cy, R, edge.source.angle, endAngle);
            let path = document.createElementNS("http://www.w3.org/2000/svg", "path");

            setAttributes(path, { d: d, stroke: color_arc, 'stroke-width': thickness, fill: 'none',
                                  class: 'edge-arc', 'marker-end': 'url(#arrow_arc)' });
            edgeGroup.appendChild(path);
        }
    });
    
    // Draw Nodes
    nodes.forEach(node => {
        let p = polarToCartesian(cx, cy, node.dist * unit_len, node.angle);
        
        let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        if (!node.n_mod_3) g.setAttribute('class', 'node-mult-3');

        let circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        setAttributes(circle, {cx: p.x, cy: p.y, r: node_radius, class: 'node-circle', 'stroke-width': thickness});
        g.appendChild(circle);

        let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        // Adjust slight optical y alignment for central baseline
        setAttributes(text, {x: p.x, y: p.y + font_size * 0.05, class: 'node-text', 'font-size': font_size});
        text.textContent = node.n.toString();
        g.appendChild(text);
        nodeGroup.appendChild(g);
    });
    
    // Start scrolling centered
    const mainDiv = document.getElementById('main');
    mainDiv.scrollTop = (svg.clientHeight - mainDiv.clientHeight) / 2;
    mainDiv.scrollLeft = (svg.clientWidth - mainDiv.clientWidth) / 2;
}

window.onload = drawGraph;
