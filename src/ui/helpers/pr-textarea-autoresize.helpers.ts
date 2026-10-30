// Grows a textarea to fit its content (the Notes tab's text fields).
export const autoResizeTextarea = (el: HTMLElement): void => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};
