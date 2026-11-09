async function preparePrint() {
  const button = document.getElementById("printButton");
  const status = document.getElementById("printStatus");
  const resources = [document.fonts.ready];
  for (const image of document.images) resources.push(image.decode());
  const results = await Promise.allSettled(resources);
  const failed = results.some(function (result) { return result.status === "rejected"; });
  status.textContent = "Usa le opzioni del dispositivo per stampare o salvare il PDF.";
  if (failed) status.textContent = "Alcune immagini non sono state caricate: controlla l’anteprima prima di stampare.";
  button.addEventListener("click", function () { window.print(); });
  button.disabled = false;
}

preparePrint();
