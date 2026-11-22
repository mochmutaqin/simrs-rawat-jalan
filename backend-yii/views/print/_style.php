<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

/** Gaya cetak bersama invoice & struk. */
?>
<style>
  :root { --ink:#1b1f24; --muted:#5b6470; --line:#d9dde3; --accent:#0f6b5c; }
  * { box-sizing:border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color:var(--ink); margin:0; background:#eef1f4; }
  .page { background:#fff; max-width:800px; margin:24px auto; padding:32px 40px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid var(--accent); padding-bottom:14px; }
  .head h1 { margin:0; font-size:20px; color:var(--accent); }
  .head .addr { color:var(--muted); font-size:12px; margin-top:4px; }
  .doc { text-align:right; }
  .doc .title { font-size:22px; font-weight:700; letter-spacing:.06em; }
  .doc .no { font-family: Consolas, monospace; font-size:13px; color:var(--muted); }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:4px 24px; margin:18px 0; font-size:13px; }
  .meta div span { color:var(--muted); display:inline-block; min-width:140px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; background:#f4f6f8; border-bottom:1px solid var(--line); padding:8px; font-weight:600; }
  td { border-bottom:1px solid var(--line); padding:7px 8px; vertical-align:top; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
  tr.void td { color:#9aa1a9; text-decoration:line-through; }
  .group td { background:#fafbfc; font-weight:600; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .totals { margin-left:auto; width:320px; margin-top:12px; font-size:13px; }
  .totals div { display:flex; justify-content:space-between; padding:4px 0; }
  .totals .grand { border-top:2px solid var(--ink); font-size:16px; font-weight:700; padding-top:8px; }
  .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; }
  .paid { background:#dff3ea; color:#0f6b3c; } .partial { background:#fff1d6; color:#8a5a00; } .unpaid { background:#fde4e4; color:#9b1c1c; }
  .foot { margin-top:28px; display:flex; justify-content:space-between; font-size:12px; color:var(--muted); }
  .sign { text-align:center; width:200px; } .sign .line { margin-top:56px; border-top:1px solid var(--ink); padding-top:4px; color:var(--ink); }
  .toolbar { max-width:800px; margin:16px auto 0; text-align:right; }
  .toolbar button { background:var(--accent); color:#fff; border:0; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:14px; }
  @media print { body { background:#fff; } .page { box-shadow:none; margin:0; max-width:none; padding:0; } .toolbar { display:none; } }
</style>
