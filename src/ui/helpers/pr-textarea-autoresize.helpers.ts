// Grows a textarea to fit its content (NotesSection's note fields).
export const autoResizeTextarea = (el: HTMLElement): void => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};
