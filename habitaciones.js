// habitaciones.js
import { chromium } from "playwright";

/**
 * Distribuir huéspedes en habitaciones
 */
export function distribuir_huespedes(total_adultos, total_ninos, max_adultos = 2, max_ninos = 3) {
  if (total_ninos === 0 && total_adultos > 2) {
    if (total_adultos === 3) return [{ adultos: 3, ninos: 0 }];
    const mitad = Math.floor(total_adultos / 2);
    if (total_adultos % 2 === 1) {
      return [
        { adultos: mitad + 1, ninos: 0 },
        { adultos: mitad, ninos: 0 }
      ];
    }
  }

  const habitaciones = [{ adultos: Math.min(2, total_adultos), ninos: 0 }];
  total_adultos -= habitaciones[0].adultos;

  if (total_ninos === 0 && total_adultos === 0) return habitaciones;

  max_adultos = (total_adultos + habitaciones[0].adultos) % 2 === 1 ? 3 : 2;

  if (total_ninos > 0) {
    if (habitaciones[0].adultos > 1) {
      habitaciones[0].adultos -= 1;
      total_adultos += 1;
    }
    const capacidad = 4 - habitaciones[0].adultos;
    const hab_ninos = Math.min(total_ninos, capacidad, max_ninos);
    habitaciones[0].ninos = hab_ninos;
    total_ninos -= hab_ninos;
  }

  while (total_adultos > 0 && habitaciones.length < 4) {
    const hab_adultos = total_ninos > 0 ? 1 : Math.min(total_adultos, max_adultos);
    const capacidad = 4 - hab_adultos;
    let hab_ninos = 0;
    if (total_ninos > 0) {
      hab_ninos = Math.min(total_ninos, capacidad, max_ninos);
      total_ninos -= hab_ninos;
    }
    habitaciones.push({ adultos: hab_adultos, ninos: hab_ninos });
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
 * Configurar habitaciones en la UI con Playwright
 */
export async function configurar_habitaciones(page, habitaciones, edades_ninos = [], edades_infantes = []) {
  const todas_edades = [...edades_ninos, ...edades_infantes];
  let edad_idx = 0;

  // Abrir dropdown
  const dropdown = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:dropdown");
  await dropdown.click();
  await page.waitForTimeout(500);

  // Configurar primera habitación
  const select_adultos = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:0\\:adults");
  await select_adultos.selectOption(`${habitaciones[0].adultos}`);
  const select_ninos = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:0\\:children");
  await select_ninos.selectOption(`${habitaciones[0].ninos}`);
  await page.waitForTimeout(1500);

  for (let n = 0; n < habitaciones[0].ninos; n++) {
    const select_edad = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:0\\:childAges\\:${n}\\:age`);
    const edad = edad_idx < todas_edades.length ? `${todas_edades[edad_idx]}` : "5";
    await select_edad.selectOption(edad);
    edad_idx++;
    await page.waitForTimeout(500);
  }

  // Crear y configurar demás habitaciones
  for (let i = 1; i < habitaciones.length; i++) {
    const btn_add = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:addRoom");
    await btn_add.click();
    await page.waitForTimeout(1000);

    const sel_adultos = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:adults`);
    await sel_adultos.selectOption(`${habitaciones[i].adultos}`);
    const sel_ninos = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:children`);
    await sel_ninos.selectOption(`${habitaciones[i].ninos}`);
    await page.waitForTimeout(1500);

    for (let n = 0; n < habitaciones[i].ninos; n++) {
      const select_edad = page.locator(`#j_id_6v\\:init-compositor-all\\:roomsSH\\:distri\\:${i}\\:childAges\\:${n}\\:age`);
      const edad = edad_idx < todas_edades.length ? `${todas_edades[edad_idx]}` : "5";
      await select_edad.selectOption(edad);
      edad_idx++;
      await page.waitForTimeout(500);
    }
  }

  // Aceptar configuración
  const btn_aceptar = page.locator("#j_id_6v\\:init-compositor-all\\:roomsSH\\:accept");
  await btn_aceptar.click();
  await page.waitForTimeout(500);
}
