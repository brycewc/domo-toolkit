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
