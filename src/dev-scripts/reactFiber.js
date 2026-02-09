// Get React fiber from any DOM element
function getReactFiber(element) {
  const key = Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
  return element[key];
}

// Walk up the fiber tree to find interesting props
function getReactProps(element) {
  const key = Object.keys(element).find((k) => k.startsWith('__reactProps$'));
  return element[key];
}

// Example: inspect what onClick does
const button = document.querySelector('.MenuItem-module_button__1-Tcl_v890');
const fiberKey = Object.keys(button).find((k) => k.startsWith('__reactFiber$'));
let fiber = button[fiberKey];

// Walk UP the fiber tree to find where onClick originates
while (fiber) {
  if (fiber.memoizedProps?.onClick) {
    console.log('Component:', fiber.type?.name || fiber.type);
    console.log('onClick:', fiber.memoizedProps.onClick.toString());
  }
  fiber = fiber.return;
}

// Find the account row element
const row = document.querySelector('[data-menu-item-button]');
const fiberKey = Object.keys(row).find((k) => k.startsWith('__reactFiber$'));
let fiber = row[fiberKey];

// Walk up to find the first meaningful onClick (skip generic wrappers)
while (fiber) {
  const onClick = fiber.memoizedProps?.onClick;
  if (onClick && !onClick.toString().includes('closeMenu')) {
    console.log('Type:', fiber.type?.name || fiber.type);
    console.log('onClick:', onClick.toString());
    console.log('Props:', fiber.memoizedProps);
    break;
  }
  fiber = fiber.return;
}
