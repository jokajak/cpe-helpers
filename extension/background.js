// Make clicking the toolbar icon open the side panel (instead of a popup), so it
// stays open beside the ISC2 form for copy/paste and per-page autofill.

function enableSidePanelOnClick() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}

// setPanelBehavior persists, but set it on install and on each service-worker
// startup to be safe.
enableSidePanelOnClick();
chrome.runtime.onInstalled.addListener(enableSidePanelOnClick);
