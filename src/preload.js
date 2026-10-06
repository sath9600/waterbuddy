// The only bridge between the app's pages (reminder, character picker) and the app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("waterbuddy", {
  config: () => ipcRenderer.invoke("popup:config"),
  choose: choice => ipcRenderer.send("popup:choice", choice),        // "drink" | "later"
  setInteractive: on => ipcRenderer.send("popup:interactive", !!on), // let clicks through except over buttons
  done: () => ipcRenderer.send("popup:done"),
  // character picker
  characters: () => ipcRenderer.invoke("picker:list"),
  chooseCharacter: id => ipcRenderer.send("picker:choose", id),
});
