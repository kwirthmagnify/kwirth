// tests/scopeAllows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeAllows } from "@kwirthmagnify/kwirth-common-back";

// src/common/FilemanTypes.ts
var FILEMAN_SCOPES = [
  { scope: "fileman$user" /* USER */, label: "File Manager \xB7 User", description: "Open File Manager and browse a container filesystem" },
  { scope: "fileman$read" /* READ */, label: "File Manager \xB7 Read", description: "Open and download files" },
  { scope: "fileman$write" /* WRITE */, label: "File Manager \xB7 Write", description: "Create, edit, rename, move, copy, delete and upload files" }
];
var FILEMAN_SCOPE_LADDER = ["", "fileman$user" /* USER */, "fileman$read" /* READ */, "fileman$write" /* WRITE */, "cluster", "admin"];

// tests/scopeAllows.test.ts
var levelOf = (scope) => FILEMAN_SCOPE_LADDER.indexOf(scope);
var USER = "fileman$user" /* USER */;
var READ = "fileman$read" /* READ */;
var WRITE = "fileman$write" /* WRITE */;
var allows = (resources, required) => scopeAllows(resources, required, levelOf);
test("\u{1F534} solo lectura NO puede escribir: es el caso que lo motiva", () => {
  assert.equal(allows("fileman$read:pre:::", READ), true);
  assert.equal(allows("fileman$read:pre:::", WRITE), false);
});
test("quien puede escribir puede leer, sin concederle los dos", () => {
  assert.equal(allows("fileman$write:pre:::", READ), true);
  assert.equal(allows("fileman$write:pre:::", WRITE), true);
});
test("cluster y admin estan por encima de write y pasan", () => {
  for (const scope of ["cluster", "admin"]) {
    assert.equal(allows(`${scope}::::`, WRITE), true, `'${scope}' deberia pasar`);
    assert.equal(allows(`${scope}::::`, READ), true, `'${scope}' deberia pasar`);
  }
});
test("sin scope, con recursos vacios o con un scope desconocido no se concede nada", () => {
  for (const resources of ["::::", "", "log$view:pre:::", "fileman$inventado:pre:::"]) {
    assert.equal(allows(resources, READ), false, `'${resources}' no deberia leer`);
    assert.equal(allows(resources, WRITE), false, `'${resources}' no deberia escribir`);
  }
});
test("varios recursos se combinan con OR y gana el scope mas alto", () => {
  const mixto = "fileman$read:pro:::;fileman$write:pre:::";
  assert.equal(allows(mixto, READ), true);
  assert.equal(allows(mixto, WRITE), true);
});
test("una lista de scopes en el mismo recurso tambien se recorre entera", () => {
  assert.equal(allows("log$view,fileman$write:pre:::", WRITE), true);
  assert.equal(allows("log$view,fileman$read:pre:::", WRITE), false);
});
test("\u{1F534} user abre y navega, pero NI lee NI escribe", () => {
  assert.equal(allows("fileman$user:pre:::", USER), true);
  assert.equal(allows("fileman$user:pre:::", READ), false);
  assert.equal(allows("fileman$user:pre:::", WRITE), false);
});
test("read incluye user, y write incluye los dos", () => {
  assert.equal(allows("fileman$read:pre:::", USER), true);
  assert.equal(allows("fileman$write:pre:::", USER), true);
  assert.equal(allows("fileman$write:pre:::", READ), true);
});
test("\u{1F534} cluster y admin siguen por encima: nadie se queda fuera al publicar esto", () => {
  for (const scope of ["cluster", "admin"]) {
    assert.equal(allows(`${scope}::::`, USER), true, `'${scope}' deberia poder abrir`);
    assert.equal(allows(`${scope}::::`, WRITE), true, `'${scope}' deberia poder escribir`);
  }
});
test("el catalogo declara exactamente los tres, y todos estan en la escalera", () => {
  assert.deepEqual(FILEMAN_SCOPES.map((s) => s.scope), [USER, READ, WRITE]);
  for (const s of FILEMAN_SCOPES) {
    assert.ok(FILEMAN_SCOPE_LADDER.includes(s.scope), `'${s.scope}' se ofrece pero no esta en la escalera`);
    assert.ok(s.label.trim().length > 0 && s.description.trim().length > 0, `'${s.scope}' sin etiqueta o descripcion`);
  }
});
