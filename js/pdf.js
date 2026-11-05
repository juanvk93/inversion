import { avisar } from "./dialog.js";
import { closeDrawer } from "./drawer.js";
import { flash } from "./state.js";
import { $, hoyDia } from "./utils.js";

// ── PDF export (lazy-load) ───────────────────────────────────────────────
function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    // CORS: así el Service Worker recibe una respuesta normal (no opaca) que
    // puede validar antes de cachear
    s.crossOrigin = "anonymous";
    if (integrity) s.integrity = integrity;   // SRI: rechaza el script si el CDN lo altera
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

let _pdfLibsLoaded = false;
export async function ensurePDFLibs() {
  if (_pdfLibsLoaded) return;
  await Promise.all([
    loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
      "sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/"),
    loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H"),
  ]);
  _pdfLibsLoaded = true;
}

export async function exportarPDF() {
  const btn = $("#btnPDF");
  const orig = btn?.querySelector(".di-title")?.textContent;
  try {
    if (btn) btn.querySelector(".di-title").textContent = "GENERANDO…";
    await ensurePDFLibs();
    const main = $("#main");
    const bg = getComputedStyle(document.body).backgroundColor || "#080C12";
    const canvas = await html2canvas(main, { backgroundColor: bg, scale: 1.5, logging: false, useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pdfW = 210, pdfH = 297;
    const imgH = canvas.height * pdfW / canvas.width;
    let heightLeft = imgH, position = 0;
    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, position, pdfW, imgH);
    heightLeft -= pdfH;
    while (heightLeft > 0) {
      position -= pdfH;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfW, imgH);
      heightLeft -= pdfH;
    }
    const fecha = hoyDia();
    pdf.save(`mi-cartera-${fecha}.pdf`);
    flash();
    closeDrawer();
  } catch (err) {
    console.error("[Cartera] Error generando PDF", err);
    avisar("No se pudo generar el PDF: " + (err?.message || err));
  } finally {
    if (btn && orig) btn.querySelector(".di-title").textContent = orig;
  }
}
