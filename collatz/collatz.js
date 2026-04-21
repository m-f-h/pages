
        // Helper: Convert Polar to Cartesian coordinates
        function polarToCartesian(cx, cy, r, angleInDegrees) {
            let angleInRadians = angleInDegrees * Math.PI / 180.0;
            return {
                x: cx + r * Math.cos(angleInRadians),
                y: cy + r * Math.sin(angleInRadians)
            };
        }
        // Helper: Generate SVG Path string for an arc
        function describeArc(cx, cy, r, startAngle, endAngle) {
            let start = polarToCartesian(cx, cy, r, startAngle), end = polarToCartesian(cx, cy, r, endAngle);
            
            // Sweep flag is 1 for increasing angle (CW rendering in SVG coords)
            let sweepFlag = "1"; 
            let sweepAngle = endAngle - startAngle;
            let largeArcFlag = sweepAngle <= 180 ? "0" : "1";

            return [
                "M", start.x, start.y, 
                "A", r, r, 0, largeArcFlag, sweepFlag, end.x, end.y
            ].join(" ");
        }

        function drawGraph() {
            const max_gen = parseInt(document.getElementById('in_max_gen').value);
            const unit_len = parseInt(document.getElementById('in_unit_len').value);
            const thickness = parseInt(document.getElementById('in_thickness').value);
            const font_size = parseInt(document.getElementById('in_font_size').value);
            const truncate = parseInt(document.getElementById('truncate').value);
            const position = document.getElementById('position').value;
            
            const color_straight = document.getElementById('color_straight').value;
            const color_arc = document.getElementById('color_arc').value;

            let nodes = [], edges = [];

            // Queue elements: { n: BigInt, dist: int, angle: float, cw_bound: float }
            // cw_bound maintains the available angle space partitioned by previous branches
            let queue = [{ n: 2n, dist: 0, angle: 0, cw_bound: -360 }];

            while (queue.length > 0) {
                let current = queue.shift();
                
                let is_mult_3 = (current.n % 3n === 0n);
                current.is_mult_3 = is_mult_3;
                nodes.push(current);

                // Stop expanding this branch if we truncate at multiples of 3
                if (is_mult_3 && truncate && (truncate==1 || !(current.n & 1n))) continue;

                let n_minus_1 = current.n - 1n;
                let new_cw_bound = current.cw_bound;

                // 1. Check for valid 3n+1 reverse child
                if (n_minus_1 % 3n === 0n) {
                    let m = n_minus_1 / 3n;
                    // Validate Collatz rules: must be odd, and we skip 1
                    if (m > 1n && (m & 1n)) {
                        let m_mod_3 = m % 3n, t = 0.5;
                        // Place arc child; for multiples of 3, depending on "position" setting.
                        if (!m_mod_3 && position!="middle")
                                if (position=="end") t = 0.9; // in any case
                                else if (truncate) t = 0.1; // only if truncated
                        let child3_angle = current.angle + (current.cw_bound - current.angle)*t;
                        // Update boundary for the radial ray
                        // if not multiple of 3, or not truncated
                        if (m_mod_3 || !truncate) new_cw_bound = child3_angle; 
                        let child3 = { 
                            n: m, 
                            dist: current.dist, 
                            angle: child3_angle, 
                            cw_bound: current.cw_bound 
                        };
                        
                        queue.push(child3);
                        edges.push({ type: 'arc', source: child3, target: current, dist: current.dist });
                    }
                }

                // 2. Generate radial *2 child
                if (current.dist < max_gen) {
                    let child2 = { 
                        n: current.n * 2n, 
                        dist: current.dist + 1, 
                        angle: current.angle, 
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
            svg.setAttribute('width', R_max * 2);
            svg.setAttribute('height', R_max * 2);

            // Compute ideal arrow offsets based on node radius
            const node_radius = Math.max(12, font_size * 0.85);
            // refX sets the offset of the arrowhead from the exact target coordinate
            const refX = 10 + node_radius + thickness; 

            // Create SVG definitions for Arrowheads
            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            defs.innerHTML = `
                <marker id="arrow_straight" viewBox="0 0 10 10" refX="${refX}" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="${color_straight}" />
                </marker>
                <marker id="arrow_arc" viewBox="0 0 10 10" refX="${refX}" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="${color_arc}" />
                </marker>
            `;
            svg.appendChild(defs);

            const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            svg.appendChild(edgeGroup); svg.appendChild(nodeGroup);

            // Draw Edges
            edges.forEach(edge => {
                if (edge.type === 'straight') {
                    let p1 = polarToCartesian(cx, cy, edge.source.dist * unit_len, edge.source.angle);
                    let p2 = polarToCartesian(cx, cy, edge.target.dist * unit_len, edge.target.angle);
                    
                    let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute('x1', p1.x); 
                    line.setAttribute('y1', p1.y);
                    line.setAttribute('x2', p2.x); 
                    line.setAttribute('y2', p2.y);
                    line.setAttribute('stroke', color_straight);
                    line.setAttribute('stroke-width', thickness);
                    line.setAttribute('class', 'edge-straight');
                    line.setAttribute('marker-end', 'url(#arrow_straight)');
                    edgeGroup.appendChild(line);
                } else {
                    let d = describeArc(cx, cy, edge.dist * unit_len, edge.source.angle, edge.target.angle);
                    
                    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute('d', d);
                    path.setAttribute('stroke', color_arc);
                    path.setAttribute('stroke-width', thickness);
                    path.setAttribute('class', 'edge-arc');
                    path.setAttribute('marker-end', 'url(#arrow_arc)');
                    edgeGroup.appendChild(path);
                }
            });

            // Draw Nodes
            nodes.forEach(node => {
                let p = polarToCartesian(cx, cy, node.dist * unit_len, node.angle);
                
                let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                if (node.is_mult_3) g.setAttribute('class', 'node-mult-3');

                let circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute('cx', p.x);
                circle.setAttribute('cy', p.y);
                circle.setAttribute('r', node_radius);
                circle.setAttribute('class', 'node-circle');
                circle.setAttribute('stroke-width', thickness);
                g.appendChild(circle);

                let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute('x', p.x);
                // Adjust slight optical alignment for central baseline
                text.setAttribute('y', p.y + (font_size * 0.05)); 
                text.setAttribute('class', 'node-text');
                text.setAttribute('font-size', font_size);
                text.textContent = node.n.toString();
                g.appendChild(text);

                nodeGroup.appendChild(g);
            });
            
            // Start scrolling centered
            const mainDiv = document.getElementById('main');
            mainDiv.scrollTop = (svg.clientHeight - mainDiv.clientHeight) / 2;
            mainDiv.scrollLeft = (svg.clientWidth - mainDiv.clientWidth) / 2;
        }

        // Initialize on load
        window.onload = drawGraph;
