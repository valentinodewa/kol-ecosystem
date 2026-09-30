import assert from "node:assert/strict";
import test from "node:test";
import { mergePerformanceRows } from "./collector.ts";
import { parseCsv } from "./csv.ts";

test("menggabungkan register dan NMAT berdasarkan upline serta mengurutkan NMAT", () => {
  const registration = parseCsv(
    "upline,total_outlet_terdaftar,total_outlet_aktif\nFA001,10,8\nFA002,20,15\n",
  );
  const nmat = parseCsv(
    "upline,total_nmat,total_achieve_trx,total_achieve_rev\nFA001,5,30,1000\nFA002,9,50,2000\n",
  );

  assert.deepEqual(mergePerformanceRows(registration, nmat), [
    {
      uplineId: "FA002",
      totalRegistered: 20,
      totalActive: 15,
      totalNmat: 9,
      totalAchieveTrx: 50,
      totalAchieveRev: 2000,
    },
    {
      uplineId: "FA001",
      totalRegistered: 10,
      totalActive: 8,
      totalNmat: 5,
      totalAchieveTrx: 30,
      totalAchieveRev: 1000,
    },
  ]);
});

test("member tanpa transaksi mendapat metrik NMAT nol", () => {
  const registration = parseCsv("upline,total_registered,total_active\nFA001,10,8\n");
  assert.equal(mergePerformanceRows(registration, [])[0]?.totalNmat, 0);
});

test("menolak upline NMAT yang tidak ada pada data register", () => {
  const nmat = parseCsv(
    "upline,total_nmat,total_achieve_trx,total_achieve_rev\nFA999,1,1,0\n",
  );
  assert.throws(() => mergePerformanceRows([], nmat), /tidak ada pada CSV register/);
});
