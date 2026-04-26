// Reads visible profile data from a LinkedIn /in/* page.
// Called by the popup — no automated navigation or DOM crawling.

function extractProfileData() {
  const name =
    document.querySelector("h1.text-heading-xlarge")?.textContent?.trim() ??
    document.querySelector("h1")?.textContent?.trim() ??
    "";

  const title =
    document.querySelector(".text-body-medium.break-words")?.textContent?.trim() ??
    "";

  const company =
    document.querySelector(".inline-show-more-text--is-collapsed")?.textContent?.trim() ??
    document.querySelector("[aria-label='Current company']")?.textContent?.trim() ??
    "";

  const linkedinUrl = window.location.href.split("?")[0];

  return { name, title, company, linkedinUrl };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "EXTRACT_PROFILE") {
    sendResponse(extractProfileData());
  }
});
