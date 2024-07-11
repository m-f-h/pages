  // Add event listener to the navigation trigger
document.querySelector('.cd-side-hide').addEventListener('click', function() {
  // Toggle the sidebar navigation
  document.querySelector('.cd-side-nav').style.visibility = "hidden";
});
document.querySelector('.cd-nav-trigger').addEventListener('click', function() {
  // Toggle the sidebar navigation
  document.querySelector('.cd-side-nav').style.visibility = "visible";
});
