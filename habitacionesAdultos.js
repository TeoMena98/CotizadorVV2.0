// habitacionesAdultos.js
import { chromium } from "playwright";

/**
 * Distribuir solo adultos en habitaciones
 */
export function distribuir_huespedesAdultos(total_adultos, total_ninos, max_adultos = 2, max_ninos = 3) {
  const habitaciones = [];

  max_adultos = total_adultos % 2 === 1 ? 3 : 2;

  while (total_adultos > 0 && habitaciones.length < 4) {
    const hab_adultos = Math.min(total_adultos, max_adultos);
    habitaciones.push({ adultos: hab_adultos, ninos: 0 });
    total_adultos -= hab_adultos;
  }

  let i = 0;
  while (total_ninos > 0 && i < habitaciones.length) {
    const capacidad_restante = 4 - habitaciones[i].adultos - habitaciones[i].ninos;
    if (capacidad_restante > 0 && habitaciones[i].adultos > 0) {
      const hab_ninos = Math.min(total_ninos, capacidad_restante, max_ninos - habitaciones[i].ninos);
      if (hab_ninos > 0) {
        habitaciones[i].ninos += hab_ninos;
        total_ninos -= hab_ninos;
      }
    }
    i++;
  }

  while (total_ninos > 0 && habitaciones.length < 4 && total_adultos > 0) {
    const hab_adultos = Math.min(total_adultos, 1);
    const hab_ninos = Math.min(total_ninos, max_ninos, 4 - hab_adultos);
    habitaciones.push({ adultos: hab_adultos, ninos: hab_ninos });
    total_adultos -= hab_adultos;
    total_ninos -= hab_ninos;
  }

  return habitaciones;
}

/**
 * Configurar habitaciones para solo adultos en la UI con Playwright
 */
export async function configurar_habitacionesAdultos(page, habitaciones, edades_ninos = [], edades_infantes = []) {
  const todas_edades = [...edades_ninos, ...edades_infantes];
  let edad_idx = 0;

  try {
    const dropdown_btn = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:dropdown");
    await dropdown_btn.click();
    await page.locator(".c-choose-rooms__row").first().waitFor();
  } catch {
    console.warn("[ADVERTENCIA] No se pudo abrir el dropdown de habitaciones");
    return;
  }

  let habitaciones_existentes = await page.locator(".c-choose-rooms__row").elementHandles();
  let num_existentes = habitaciones_existentes.length;

  while (num_existentes < habitaciones.length) {
    const btn_add = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:addRoom");
    await btn_add.click();
    await page.waitForFunction(
      (num) => document.querySelectorAll(".c-choose-rooms__row").length > num,
      num_existentes
    );
    num_existentes++;

    const i = num_existentes - 1;
    const hab = habitaciones[i];

    const select_adultos = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:adults`);
    await select_adultos.selectOption(`${hab.adultos}`);

    const select_ninos = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:children`);
    await select_ninos.selectOption(`${hab.ninos}`);

    for (let n = 0; n < hab.ninos; n++) {
      const select_edad = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:childAges\\:${n}\\:age`);
      const edad = edad_idx < todas_edades.length ? `${todas_edades[edad_idx]}` : "5";
      await select_edad.selectOption(edad);
      edad_idx++;
    }
  }

  // Configurar habitaciones existentes
  for (let i = 0; i < habitaciones.length; i++) {
    const hab = habitaciones[i];

    const select_adultos = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:adults`);
    await select_adultos.selectOption(`${hab.adultos}`);

    const select_ninos = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:children`);
    await select_ninos.selectOption(`${hab.ninos}`);

    for (let n = 0; n < hab.ninos; n++) {
      const select_edad = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:childAges\\:${n}\\:age`);
      const edad = edad_idx < todas_edades.length ? `${todas_edades[edad_idx]}` : "5";
      await select_edad.selectOption(edad);
      edad_idx++;
    }
  }

  const btn_aceptar = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:accept");
  await btn_aceptar.click();
  await btn_aceptar.waitFor({ state: "hidden" });
}
