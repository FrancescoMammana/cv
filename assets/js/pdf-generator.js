async function preparePrint() {
  const button = document.getElementById("pdfButton");
  const status = document.getElementById("printStatus");
  const resources = [document.fonts.ready];
  for (const image of document.images) resources.push(image.decode());
  const results = await Promise.allSettled(resources);
  const failed = results.some(function (result) { return result.status === "rejected"; });
  status.hidden = !failed;
  if (failed) status.textContent = "Alcune immagini non sono state caricate: controlla il CV prima di stampare.";
  const title = document.title;
  const name = document.querySelector(".name").textContent.trim();
  window.addEventListener("beforeprint", function () {
    document.title = name.replace(/\s+/g, "_") + "_CV";
  });
  window.addEventListener("afterprint", function () { document.title = title; });
  button.addEventListener("click", function () { window.print(); });
  button.disabled = false;
}

preparePrint();
