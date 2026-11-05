// Tests de los cálculos (js/calc.js) y del parseo de importes (js/utils.js).
// Sin dependencias: `node --test` (Node ≥ 20). También se ejecutan en el
// despliegue (.github/workflows/pages.yml): si alguno falla, no se publica.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PROY_TASA_MAX, PROY_TASA_MIN, acotarMediaMensual, calcCosteMedio, calcCostes, calcImpuestoTramos,
  calcMaxDrawdown, calcPendientes, calcProyeccion, calcStats, calcStreakProducto, calcStreakTotal, calcTIR,
  calcVolatilidad, divisasSinTipo, memoMonteCarlo, entradasEUR, filtrarFilas, invalidateStatsCache, tipoCambio, mesesHistorial, posicionPrevia, simulateMonteCarlo,
  statsTotalCalc, tasaMensualEq, tasaProyeccion,
} from "../js/calc.js";
import { parseNum } from "../js/utils.js";

const cerca = (real, esperado, tol = 1e-6, msg) =>
  assert.ok(Math.abs(real - esperado) <= tol, msg ?? `${real} ≠ ${esperado} (±${tol})`);

// n meses consecutivos desde `desde` (YYYY-MM); f(i) da el resto de campos
function serie(desde, n, f) {
  const [y, m] = desde.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return { fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, manual: 0, saveback: 0, roundup: 0, valor: 0, ...f(i) };
  });
}

describe("calcTIR", () => {
  test("una aportación que crece un 10% en un año", () => {
    const tir = calcTIR([
      { fecha: "2025-01", manual: 1000, valor: 1000 },
      { fecha: "2026-01", manual: 0,    valor: 1100 },
    ]);
    cerca(tir, 0.10, 1e-6);
  });

  test("sin rentabilidad → 0", () => {
    const tir = calcTIR(serie("2025-01", 12, i => ({ manual: 100, valor: 100 * (i + 1) })));
    cerca(tir, 0, 1e-6);
  });

  test("las rentas cobradas suben la TIR", () => {
    const ents = [
      { fecha: "2025-01", manual: 1000, valor: 1000 },
      { fecha: "2025-07", manual: 0,    valor: 1000, dividendo: 50 },
      { fecha: "2026-01", manual: 0,    valor: 1000 },
    ];
    const sinRenta = calcTIR(ents.map(e => ({ ...e, dividendo: 0 })));
    cerca(sinRenta, 0, 1e-6);
    assert.ok(calcTIR(ents) > 0.045 && calcTIR(ents) < 0.055, `TIR con renta: ${calcTIR(ents)}`);
  });

  test("un producto que empieza con dinero ya invertido: la posición previa no es rentabilidad", () => {
    // Primer registro: aporta 100 pero ya valía 5.100 → 5.000 de posición previa
    const ents = serie("2025-01", 13, i => ({ manual: 100, valor: 5000 + 100 * (i + 1) }));
    cerca(calcTIR(ents), 0, 1e-6);
    // Desordenadas también (calcTIR ordena por fecha)
    cerca(calcTIR([...ents].reverse()), 0, 1e-6);
  });

  test("datos insuficientes → null", () => {
    assert.equal(calcTIR([]), null);
    assert.equal(calcTIR([{ fecha: "2025-01", manual: 0, valor: 0 }]), null);
  });
});

describe("calcStats", () => {
  const filas = calcStats([
    { fecha: "2025-02", manual: 100, valor: 1250 },
    { fecha: "2025-01", manual: 1000, saveback: 5, roundup: 1, valor: 1006 },
  ]);

  test("ordena por fecha y acumula por tipo", () => {
    assert.deepEqual(filas.map(f => f.fecha), ["2025-01", "2025-02"]);
    assert.equal(filas[1].acumAportado, 1106);
    assert.equal(filas[1].acumManual, 1100);
    assert.equal(filas[1].acumSaveback, 5);
    assert.equal(filas[1].ganancia, 1250 - 1106);
  });

  test("la posición previa del primer mes cuenta como aportado", () => {
    const f = calcStats([
      { fecha: "2025-01", manual: 100, valor: 5100 },
      { fecha: "2025-02", manual: 100, valor: 5300 },
    ]);
    assert.equal(f[0].acumPrevia, 5000);
    assert.equal(f[0].ganancia, 0);
    assert.equal(f[1].acumAportado, 5200);
    assert.equal(f[1].ganancia, 100);
    assert.equal(posicionPrevia({ fecha: "2025-03", manual: 50, valor: 999 }, 1), 0);   // solo el primer mes
    assert.equal(posicionPrevia({ flujoExtra: 7, manual: 1, valor: 999 }, 0), 7);      // Total: ya calculada
  });

  test("rentabilidad mensual Modified Dietz", () => {
    assert.equal(filas[0].rentMes, null);
    cerca(filas[1].rentMes, (1250 - 100 - 1006) / (1006 + 50) * 100);
  });

  test("el mes del dividendo no es una pérdida", () => {
    const f = calcStats([
      { fecha: "2025-01", manual: 1000, valor: 1000 },
      { fecha: "2025-02", manual: 0, valor: 970, dividendo: 30 },
    ]);
    cerca(f[1].rentMes, 0);
    assert.equal(f[1].ganancia, -30);         // la ganancia es solo revalorización
    assert.equal(f[1].acumDividendos, 30);
  });
});

describe("statsTotalCalc", () => {
  test("arrastra el último valor de cada producto y suma por mes", () => {
    const cartera = {
      productos: [{ id: "a" }, { id: "b" }],
      entradas: {
        a: serie("2025-01", 3, i => ({ manual: 100, valor: 100 * (i + 1) })),
        b: [{ fecha: "2025-02", manual: 50, valor: 50 }],
      },
    };
    const t = statsTotalCalc(cartera);
    assert.deepEqual(t.map(f => f.valor), [100, 250, 350]);   // b se arrastra en marzo
    assert.deepEqual(t.map(f => f.aportacion), [100, 150, 100]);
  });

  test("la posición previa de un producto nuevo es capital, no ganancia", () => {
    invalidateStatsCache();
    const cartera = {
      productos: [{ id: "a" }, { id: "b" }],
      entradas: {
        a: serie("2025-01", 13, () => ({ manual: 100 })).map((e, i) => ({ ...e, valor: 100 * (i + 1) })),
        b: [{ fecha: "2025-06", manual: 100, valor: 5100 }],   // entra con 5.000 € ya invertidos
      },
    };
    const t = statsTotalCalc(cartera);
    const ult = t.at(-1);
    assert.equal(ult.acumPrevia, 5000);
    assert.equal(ult.ganancia, 0);
    cerca(calcTIR(t), 0, 1e-6);
  });

  test("usa la caché solo para el mismo objeto cartera", () => {
    const c1 = { productos: [{ id: "a" }], entradas: { a: [{ fecha: "2025-01", manual: 1, valor: 1 }] } };
    const c2 = { productos: [{ id: "a" }], entradas: { a: [{ fecha: "2025-01", manual: 2, valor: 2 }] } };
    assert.equal(statsTotalCalc(c1).at(-1).valor, 1);
    assert.equal(statsTotalCalc(c2).at(-1).valor, 2);
  });
});

describe("calcCosteMedio (ventas parciales)", () => {
  test("una venta resta la parte proporcional del coste", () => {
    const r = calcCosteMedio([
      { fecha: "2024-01", manual: 1000, valor: 1000 },
      { fecha: "2024-06", manual: 0, valor: 2000 },
      { fecha: "2025-03", manual: -1000, valor: 1000 },   // vende la mitad
    ]);
    cerca(r.coste, 500);
    cerca(r.realizada, 500);
    assert.deepEqual(Object.keys(r.realizadaPorAno), ["2025"]);
  });

  test("venta con pérdidas → plusvalía negativa", () => {
    const r = calcCosteMedio([
      { fecha: "2024-01", manual: 1000, valor: 1000 },
      { fecha: "2024-02", manual: -400, valor: 400 },     // valía 800: vende la mitad
    ]);
    cerca(r.coste, 500);
    cerca(r.realizada, -100);
  });

  test("sin ventas el coste es lo aportado", () => {
    const r = calcCosteMedio(serie("2025-01", 5, i => ({ manual: 100, saveback: 2, valor: 102 * (i + 1) })));
    cerca(r.coste, 510);
    assert.equal(r.realizada, 0);
  });

  test("la posición previa entra al coste por su valor al registrarla", () => {
    const r = calcCosteMedio([
      { fecha: "2025-01", manual: 100, valor: 5100 },
      { fecha: "2025-02", manual: 100, valor: 5300 },
    ]);
    cerca(r.coste, 5200);
  });
});

describe("proyecciones", () => {
  test("tasaMensualEq capitaliza a la tasa anual efectiva", () => {
    cerca(Math.pow(1 + tasaMensualEq(0.1), 12), 1.1, 1e-12);
  });

  test("calcProyeccion al 0% suma las aportaciones", () => {
    const p = calcProyeccion(1000, 100, 2, 0);
    assert.equal(p.at(-1).valor, 1000 + 100 * 24);
    assert.equal(p.at(-1).aportado, 1000 + 100 * 24);
  });

  test("calcProyeccion sin aportaciones crece a la tasa anual", () => {
    assert.equal(calcProyeccion(1000, 0, 1, 0.12).at(-1).valor, 1120);
  });

  test("mesesHistorial cuenta los meses incluidos", () => {
    assert.equal(mesesHistorial([{ fecha: "2024-11" }, { fecha: "2025-10" }]), 12);
    assert.equal(mesesHistorial([]), 0);
  });

  test("con menos de 12 meses no hay tasa", () => {
    const r = tasaProyeccion(serie("2025-01", 11, i => ({ manual: 100, valor: 110 * (i + 1) })));
    assert.equal(r.tasa, null);
    assert.equal(r.insuficiente, true);
  });

  test("la tasa se acota", () => {
    const filas = serie("2024-01", 24, i => ({ manual: 100, valor: 100 * (i + 1) }));
    assert.equal(tasaProyeccion(filas, 0.9).tasa, PROY_TASA_MAX);
    assert.equal(tasaProyeccion(filas, -0.5).tasa, PROY_TASA_MIN);
    const normal = tasaProyeccion(filas, 0.07);
    assert.equal(normal.tasa, 0.07);
    assert.equal(normal.acotada, false);
  });

  test("acotarMediaMensual usa el mismo rango anual", () => {
    cerca(Math.pow(1 + acotarMediaMensual(0.5), 12) - 1, PROY_TASA_MAX, 1e-12);
    assert.equal(acotarMediaMensual(0.005), 0.005);
  });

  test("memoMonteCarlo calcula una sola vez por clave", () => {
    let n = 0;
    const a = memoMonteCarlo("test|1", () => ({ v: ++n }));
    const b = memoMonteCarlo("test|1", () => ({ v: ++n }));
    assert.equal(a, b);
    assert.equal(n, 1);
    assert.equal(memoMonteCarlo("test|2", () => ++n), 2);
  });

  test("Monte Carlo determinista y sin volatilidad = interés compuesto", () => {
    const args = { valorInicial: 1000, aportMensual: 0, meses: 12, mediaMensual: 0.01, stdMensual: 0.05, nSims: 50 };
    assert.deepEqual(simulateMonteCarlo(args), simulateMonteCarlo(args));
    const [t] = simulateMonteCarlo({ ...args, stdMensual: 0, nSims: 1 });
    cerca(t[12], 1000 * Math.pow(1.01, 12), 1e-9);
  });
});

describe("riesgo, rachas y filtros", () => {
  test("drawdown máximo", () => {
    cerca(calcMaxDrawdown([100, 120, 90, 130].map(valor => ({ valor }))), 25);
    assert.equal(calcMaxDrawdown([{ valor: 1 }]), null);
  });

  test("volatilidad necesita 3 meses", () => {
    assert.equal(calcVolatilidad([{ rentMes: 1 }, { rentMes: 2 }]), null);
    cerca(calcVolatilidad([{ rentMes: 1 }, { rentMes: 1 }, { rentMes: 1 }]), 0);
  });

  test("racha de producto: un mes con aportación 0 o un hueco la cortan", () => {
    const ok = serie("2025-01", 4, () => ({ manual: 10 }));
    assert.equal(calcStreakProducto(ok), 4);
    assert.equal(calcStreakProducto([...ok, { fecha: "2025-05", manual: 0 }]), 0);
    assert.equal(calcStreakProducto([...ok, { fecha: "2025-07", manual: 10 }]), 1);
  });

  test("racha total: basta con que un producto aporte", () => {
    const cartera = {
      productos: [{ id: "a" }, { id: "b" }],
      entradas: {
        a: [{ fecha: "2025-01", manual: 10 }, { fecha: "2025-02", manual: 0 }],
        b: [{ fecha: "2025-02", saveback: 3 }, { fecha: "2025-03", roundup: 1 }],
      },
    };
    assert.equal(calcStreakTotal(cartera), 3);
  });

  test("filtrarFilas por periodo", () => {
    const filas = serie("2024-06", 12, () => ({}));   // jun 24 … may 25
    assert.equal(filtrarFilas(filas, "3m").length, 3);
    assert.deepEqual(filtrarFilas(filas, "ytd").map(f => f.fecha)[0], "2025-01");
    assert.equal(filtrarFilas(filas, "all").length, 12);
  });

  test("costes: TER sobre el valor y comisión por aportación de los últimos 12 meses", () => {
    const cartera = {
      productos: [{ id: "a", nombre: "A", ter: 0.2, comisionCompra: 1 }, { id: "b", nombre: "B" }],
      entradas: {
        a: serie("2024-01", 18, () => ({ manual: 100, valor: 10000 })),
        b: [{ fecha: "2025-01", manual: 100, valor: 10000 }],
      },
    };
    const r = calcCostes(cartera);
    assert.equal(r.items.length, 1);
    cerca(r.items[0].costeTer, 20);
    assert.equal(r.items[0].nAport12m, 12);
    assert.equal(r.valorCartera, 20000);
  });
});

describe("divisas", () => {
  const tipos = { USD: { "2025-01": 0.9, "2025-03": 0.8 } };

  test("tipo del mes, del último mes anterior o del primero disponible", () => {
    assert.equal(tipoCambio(tipos, "EUR", "2025-02"), 1);
    assert.equal(tipoCambio(tipos, "", "2025-02"), 1);
    assert.equal(tipoCambio(tipos, "USD", "2025-01"), 0.9);
    assert.equal(tipoCambio(tipos, "USD", "2025-02"), 0.9);
    assert.equal(tipoCambio(tipos, "USD", "2026-07"), 0.8);
    assert.equal(tipoCambio(tipos, "USD", "2024-06"), 0.9);
    assert.equal(tipoCambio(tipos, "GBP", "2025-01"), null);
  });

  test("el Total suma en euros al tipo de cada mes", () => {
    const cartera = {
      productos: [{ id: "eur" }, { id: "usd", divisa: "USD" }],
      entradas: {
        eur: [{ fecha: "2025-01", manual: 100, valor: 100 }],
        usd: [{ fecha: "2025-01", manual: 100, valor: 100 }, { fecha: "2025-03", manual: 0, valor: 110, dividendo: 10 }],
      },
      tiposCambio: tipos,
    };
    const usd = entradasEUR(cartera, cartera.productos[1]);
    assert.deepEqual(usd.map(e => e.valor), [90, 88]);
    cerca(usd[1].dividendo, 8);
    assert.equal(cartera.entradas.usd[1].valor, 110);   // no muta los datos
    const t = statsTotalCalc(cartera);
    assert.deepEqual(t.map(f => f.valor), [190, 188]);
    assert.deepEqual(divisasSinTipo(cartera), []);
    assert.deepEqual(divisasSinTipo({ ...cartera, tiposCambio: {} }), ["USD"]);
  });
});

describe("calcPendientes", () => {
  const cartera = {
    productos: [{ id: "a", nombre: "A" }, { id: "b", nombre: "B" }, { id: "n", nombre: "Nuevo" }],
    entradas: {
      a: [{ fecha: "2026-09" }, { fecha: "2026-10" }],
      b: [{ fecha: "2026-08" }, { fecha: "2026-09" }],   // se saltó octubre
      n: [{ fecha: "2026-11" }],                         // empezó este mes: nada pendiente
    },
  };
  test("mes anterior saltado, cualquier día", () => {
    assert.deepEqual(calcPendientes(cartera, "2026-11", 5), [{ mes: "2026-10", productos: [{ id: "b", nombre: "B" }] }]);
  });
  test("mes en curso solo desde el día 25", () => {
    const r = calcPendientes(cartera, "2026-11", 27);
    assert.deepEqual(r.map(x => [x.mes, x.productos.map(p => p.id)]), [["2026-10", ["b"]], ["2026-11", ["a", "b"]]]);
  });
  test("enero mira diciembre del año anterior", () => {
    const c = { productos: [{ id: "a", nombre: "A" }], entradas: { a: [{ fecha: "2025-11" }] } };
    assert.equal(calcPendientes(c, "2026-01", 3)[0].mes, "2025-12");
  });
});

describe("calcImpuestoTramos (base del ahorro 2026)", () => {
  test("tramos progresivos", () => {
    assert.equal(calcImpuestoTramos(0), 0);
    assert.equal(calcImpuestoTramos(-500), 0);
    cerca(calcImpuestoTramos(6000), 1140);
    cerca(calcImpuestoTramos(50000), 1140 + 44000 * 0.21);
    cerca(calcImpuestoTramos(350000), 1140 + 9240 + 34500 + 27000 + 15000);
  });
});

describe("parseNum", () => {
  const casos = [
    ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["1234,5", 1234.5], ["7.250,5", 7250.5],
    ["1.234.567", 1234567], ["1,234,567", 1234567], ["0.125", 0.125], ["-300", -300],
    ["1 200 €", 1200], [42, 42],
  ];
  for (const [entrada, esperado] of casos) {
    test(`${JSON.stringify(entrada)} → ${esperado}`, () => assert.equal(parseNum(entrada, true), esperado));
  }

  test("miles con punto solo si se pide", () => {
    assert.equal(parseNum("12.500", true), 12500);
    assert.equal(parseNum("12.500"), 12.5);
  });

  test("texto no numérico → NaN", () => {
    assert.ok(Number.isNaN(parseNum("abc")));
    assert.ok(Number.isNaN(parseNum("")));
    assert.ok(Number.isNaN(parseNum("12x")));
  });
});
