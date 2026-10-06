// Character picker: a card per character with its dance clip looping. Choosing one closes the window and shows a reminder.
const api = window.waterbuddy;

/** Load the clip into memory first (as the reminder does) so it loops smoothly. */
async function clip(url) {
  const blob = await (await fetch(url)).blob();
  return Object.assign(document.createElement("video"), {
    src: URL.createObjectURL(blob), muted: true, loop: true, autoplay: true, playsInline: true,
  });
}

(async () => {
  const { current, characters } = await api.characters();
  const cards = document.getElementById("cards");
  for (const c of characters) {
    const card = Object.assign(document.createElement("button"), { className: "card" });
    card.dataset.id = c.id;
    card.setAttribute("aria-label", `Choose ${c.name}`);
    if (c.id === current) {
      card.classList.add("chosen");
      card.append(Object.assign(document.createElement("span"), { className: "badge", textContent: "Current" }));
    }
    const video = await clip(c.preview);
    card.append(
      video,
      Object.assign(document.createElement("span"), { className: "name", textContent: c.name }),
      Object.assign(document.createElement("span"), { className: "cta", textContent: `Choose ${c.name}` }),
    );
    card.onclick = () => api.chooseCharacter(c.id);
    cards.append(card);
    video.play().catch(() => {});
  }
  cards.querySelector(".chosen, .card")?.focus();
})();
