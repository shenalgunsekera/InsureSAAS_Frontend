// Shared quote-comparison PDF generator.
//
// Used by both:
//   • the broker download button (QuotationsPage → ComparisonView)   audience: 'broker'
//   • the customer email link    (ComparisonPdfPage)                 audience: 'customer'
//
// Two things this fixes over the old per-page generators:
//   1. Column pagination — insurers are chunked into groups so any number of
//      insurers stays readable (the old single-table layout squeezed >5 columns
//      until they were unusable / clipped).
//   2. A robust "uploaded quote documents" page where every image AND pdf is a
//      clickable link, with a graceful link fallback when an image can't be
//      embedded (CORS / fetch failure) — so clicking a quote always works.

const NAVY = [15,23,42];
const RED = [59,130,246];
const ORANGE = [99,102,241];
const GREY = [148, 163, 184];

// Max insurer columns per table chunk. Landscape A4 keeps ~225mm after the
// 52mm field column; 4 insurers ≈ 56mm each stays comfortably readable.
const GROUP_SIZE = 4;

/* Dynamic custom covers/clauses stored as JSON in form_data (mirrors QuotationsPage). */
function parseDynamicExtras(formData, storeKey) {
  try {
    return (JSON.parse(formData?.[storeKey] || '[]'))
      .filter(c => c.name?.trim() && c.value === 'Yes')
      .map(c => ({
        name: storeKey + '_' + c.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        label: c.name,
        type: 'yesno',
      }));
  } catch { return []; }
}

async function fetchBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateComparisonPdf({ quote, product, responses, audience = 'broker' }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  responses = responses || [];
  const isBroker = audience === 'broker';
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const isPlansProduct = !!product?.hasPlans;
  const planCount = isPlansProduct ? Math.max(parseInt(quote?.form_data?.no_of_plans) || 1, 1) : 0;

  const coverFields = [
    ...(product?.fields || []).filter(f => ['Covers Required', 'Cover Required'].includes(f.section) && f.type === 'yesno' && quote?.form_data?.[f.name] === 'Yes'),
    ...parseDynamicExtras(quote?.form_data, 'extra_covers'),
  ];
  const clauseFields = [
    ...(product?.fields || []).filter(f => f.section === 'Additional Clauses' && f.type === 'yesno' && quote?.form_data?.[f.name] === 'Yes'),
    ...parseDynamicExtras(quote?.form_data, 'extra_clauses'),
  ];

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();

  const drawHeader = () => {
    pdf.setFillColor(...NAVY); pdf.rect(0, 0, pw, 20, 'F');
    pdf.setFillColor(...RED); pdf.rect(0, 20, pw, 3, 'F');
    pdf.setTextColor(...ORANGE); pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
    pdf.text('INSURESAAS LTD', pw / 2, 9, { align: 'center' });
    pdf.setTextColor(...GREY); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.text('INSURANCE SAAS PLATFORM  ·  SRI LANKA', pw / 2, 15, { align: 'center' });
  };

  const drawFooter = () => {
    const pn = pdf.internal.getCurrentPageInfo().pageNumber;
    const tp = pdf.internal.getNumberOfPages();
    pdf.setFillColor(...NAVY); pdf.rect(0, ph - 14, pw, 14, 'F');
    pdf.setFillColor(...RED); pdf.rect(0, ph - 14, pw, 1, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...ORANGE);
    pdf.text('InsureSAAS Ltd', 12, ph - 8);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...GREY);
    pdf.text(
      isBroker
        ? 'CONFIDENTIAL  ·  Commission details for internal broker use only'
        : 'This comparison is prepared exclusively for you. Prices are subject to final confirmation.',
      pw / 2, ph - 8, { align: 'center' },
    );
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Page ${pn} / ${tp}`, pw - 12, ph - 8, { align: 'right' });
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139);
    pdf.text(`Generated: ${today}`, 12, ph - 3.5);
    pdf.text('Insurance SaaS Platform  ·  Sri Lanka', pw - 12, ph - 3.5, { align: 'right' });
  };

  const drawInfoBand = (groupLabel) => {
    pdf.setFillColor(249, 250, 251); pdf.rect(0, 23, pw, 12, 'F');
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
    pdf.text(isBroker ? 'QUOTE COMPARISON REPORT' : 'PERSONALISED INSURANCE COMPARISON REPORT', 14, 31);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(107, 114, 128);
    const right = `Ref: ${quote.reference}   ·   ${product?.label || ''}   ·   ${today}${groupLabel ? `   ·   ${groupLabel}` : ''}`;
    pdf.text(right, pw - 14, 31, { align: 'right' });
  };

  /* ── body builder (rebuilt per insurer-chunk) ────────────────────────────── */
  const buildBody = (resps) => {
    const colCount = resps.length + 1;
    const mkSectionRow = (label) => [{ content: label, colSpan: colCount, styles: { fillColor: NAVY, textColor: ORANGE, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } } }];
    const mkRow = (label, vals, isTotal = false, isInternal = false, i = 0) => [
      { content: label, styles: { fontStyle: isTotal ? 'bold' : 'normal', fontSize: isTotal ? 9 : 8.5, fillColor: isTotal ? RED : isInternal ? [232, 232, 255] : i % 2 === 0 ? [255, 255, 255] : [239,246,255], textColor: isTotal ? [255, 255, 255] : isInternal ? [67, 56, 202] : NAVY } },
      ...vals.map(v => ({ content: v, styles: { halign: 'center', fontStyle: isTotal ? 'bold' : 'normal', fontSize: isTotal ? 9 : 8.5, fillColor: isTotal ? RED : isInternal ? [232, 232, 255] : i % 2 === 0 ? [255, 255, 255] : [239,246,255], textColor: isTotal ? [255, 255, 255] : isInternal ? [67, 56, 202] : [55, 65, 81] } })),
    ];

    const premiumRows = isPlansProduct
      ? (() => {
          const rows = [];
          for (let pi = 0; pi < planCount; pi++) {
            rows.push([{ content: `Plan ${pi + 1}`, colSpan: colCount, styles: { fillColor: [8, 145, 178], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 8, right: 4 } } }]);
            [
              ['Basic Premium (LKR)', r => r.plan_premiums?.[pi]?.basic ? `LKR ${Number(r.plan_premiums[pi].basic).toLocaleString()}` : '—'],
              ['Tax (LKR)', r => r.plan_premiums?.[pi]?.tax ? `LKR ${Number(r.plan_premiums[pi].tax).toLocaleString()}` : '—'],
              ['Plan Total (LKR)', r => `LKR ${Number(r.plan_premiums?.[pi]?.total || 0).toLocaleString()}`],
            ].forEach(([label, getter], i) => rows.push(mkRow(label, resps.map(getter), label.startsWith('Plan Total'), false, i)));
          }
          rows.push(mkRow('GRAND TOTAL (LKR)', resps.map(r => `LKR ${Number(r.premium || 0).toLocaleString()}`), true));
          return rows;
        })()
      : [
          ...[
            ['basic_premium', 'Basic Premium (LKR)'],
            ['srcc_premium', 'SRCC (LKR)'],
            ['tc_premium', 'TC (LKR)'],
            ['policy_fees', 'Policy Fees (LKR)'],
            ['cess', 'Cess (LKR)'],
            ['road_safety_tax', 'Road Safety Tax (LKR)'],
            ['stamp_fee', 'Stamp Fee (LKR)'],
            ['nbl', 'NBL (LKR)'],
            ['ssc_levy', 'SSC Levy (LKR)'],
            ['admin_fee', 'Admin Fee (LKR)'],
            ['vat_amount', 'VAT (LKR)'],
            ['other_premium', 'Other (LKR)'],
          ].map(([k, label], i) => mkRow(label, resps.map(r => r[k] ? `LKR ${Number(r[k]).toLocaleString()}` : '—'), false, false, i)),
          mkRow('TOTAL PREMIUM (LKR)', resps.map(r => `LKR ${Number(r.premium || 0).toLocaleString()}`), true),
        ];

    return [
      mkSectionRow('PREMIUM BREAKDOWN'),
      ...premiumRows,

      mkSectionRow('DEDUCTIBLES, EXCESSES & VALIDITY'),
      mkRow('Deductibles', resps.map(r => r.deductible || '—'), false, false, 0),
      mkRow('Excesses', resps.map(r => r.excesses || '—'), false, false, 1),
      mkRow('Validity (days)', resps.map(r => r.validity_days || '—'), false, false, 2),

      ...(isBroker ? [
        mkSectionRow('COMMISSION — INTERNAL USE ONLY'),
        mkRow('Commission Type', resps.map(r => r.commission_type || '—'), false, true, 0),
      ] : []),

      ...(coverFields.length > 0 ? [
        mkSectionRow('COVERS REQUIRED'),
        ...coverFields.map((f, i) => mkRow(f.label, resps.map(r => {
          const cr = r.cover_responses?.[f.name]; return cr?.provided ? `${cr.provided}${cr.terms ? `\n${cr.terms}` : ''}` : '—';
        }), false, false, i)),
      ] : []),

      ...(clauseFields.length > 0 ? [
        mkSectionRow('ADDITIONAL CLAUSES'),
        ...clauseFields.map((f, i) => mkRow(f.label, resps.map(r => {
          const cr = r.clause_responses?.[f.name]; return cr?.provided ? `${cr.provided}${cr.terms ? `\n${cr.terms}` : ''}` : '—';
        }), false, false, i)),
      ] : []),

      mkSectionRow('NOTES / TERMS & CONDITIONS'),
      mkRow('Notes', resps.map(r => r.notes || '—'), false, false, 0),
    ];
  };

  /* ── render insurer chunks, each as its own table (guarantees all show) ───── */
  const groups = [];
  for (let i = 0; i < Math.max(responses.length, 1); i += GROUP_SIZE) {
    groups.push(responses.slice(i, i + GROUP_SIZE));
  }

  groups.forEach((groupResps, gi) => {
    if (gi > 0) pdf.addPage();
    drawHeader();
    const groupLabel = groups.length > 1 ? `Insurers ${gi * GROUP_SIZE + 1}–${gi * GROUP_SIZE + groupResps.length} of ${responses.length}` : '';
    drawInfoBand(groupLabel);

    autoTable(pdf, {
      startY: 38,
      head: [[
        { content: 'Field', styles: { fillColor: NAVY, textColor: ORANGE, fontStyle: 'bold', fontSize: 9 } },
        ...groupResps.map(r => ({ content: r.company_name + (isBroker && r.edited_by_broker ? '\n✎ Broker Edited' : ''), styles: { fillColor: RED, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, halign: 'center' } })),
      ]],
      body: buildBody(groupResps),
      columnStyles: { 0: { cellWidth: 52 } },
      styles: { fontSize: 8.5, cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 }, overflow: 'linebreak', minCellHeight: 9 },
      margin: { left: 10, right: 10, top: 28, bottom: 18 },
      didDrawPage: (data) => {
        // On vertical overflow within a group, keep the header on every page.
        // Footers are drawn in a final pass so the total page count is correct.
        if (!(data.pageNumber === 1)) drawHeader();
      },
    });
  });

  /* ── Insurer uploaded quote documents (clickable images + pdf links) ─────── */
  // Every received document is rendered (paginated across as many pages as
  // needed) and every cell is a clickable link to open the original.
  const insurerDocs = responses.filter(r => r.quote_file_url);
  if (insurerDocs.length > 0) {
    const margL = 12, usableW = pw - 24;
    const cols = Math.min(3, Math.max(insurerDocs.length, 1));
    const gap = 8;
    const colW = (usableW - gap * (cols - 1)) / cols;
    const imgMaxH = 58;              // ~2 rows (6 documents) per page
    const labelH = 7;
    const rowH = labelH + imgMaxH + 9;
    const bottomLimit = ph - 18;

    // Draws the section band and returns the y where the first row starts.
    const startDocsPage = (cont) => {
      pdf.addPage();
      drawHeader();
      let y = 26;
      pdf.setFillColor(...NAVY); pdf.rect(margL, y, usableW, 9, 'F');
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ORANGE);
      pdf.text(`INSURER UPLOADED QUOTE DOCUMENTS${cont ? ' (cont.)' : ''}`, pw / 2, y + 5, { align: 'center' });
      pdf.setFontSize(6.8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...GREY);
      pdf.text('Click any document below to open the original online', pw / 2, y + 8, { align: 'center' });
      return y + 13;
    };

    let curY = startDocsPage(false);

    for (let di = 0; di < insurerDocs.length; di++) {
      const r = insurerDocs[di];
      const url = r.quote_file_url;
      const col = di % cols;
      if (di > 0 && col === 0) curY += rowH;          // start of a new row
      if (col === 0 && curY + rowH > bottomLimit) curY = startDocsPage(true);
      const cx = margL + col * (colW + gap);

      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
      pdf.text(r.company_name, cx + colW / 2, curY + 5, { align: 'center', maxWidth: colW });

      const boxY = curY + labelH;
      const isImg = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(url);
      pdf.setFillColor(245, 247, 250); pdf.rect(cx, boxY, colW, imgMaxH, 'F');
      pdf.setDrawColor(210, 215, 225); pdf.setLineWidth(0.3); pdf.rect(cx, boxY, colW, imgMaxH, 'S');

      let embedded = false;
      if (isImg) {
        try {
          const b64 = await fetchBase64(url);
          if (!b64.startsWith('data:image/')) throw new Error('not an image');
          const dims = await new Promise(res => {
            const img = new window.Image();
            img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => res({ w: 4, h: 3 });
            img.src = b64;
          });
          const aspect = dims.w / dims.h;
          const bW = colW - 6, bH = imgMaxH - 12;
          let dw = bW, dh = dw / aspect;
          if (dh > bH) { dh = bH; dw = dh * aspect; }
          const fmt = /\.png(\?|$)/i.test(url) ? 'PNG' : 'JPEG';
          pdf.addImage(b64, fmt, cx + (colW - dw) / 2, boxY + 3, dw, dh, undefined, 'FAST');
          embedded = true;
        } catch {
          embedded = false;
        }
      }

      if (!embedded) {
        // PDF document, or an image that couldn't be embedded — show an icon.
        pdf.setFillColor(238, 242, 255); pdf.roundedRect(cx + colW / 2 - 14, boxY + 8, 28, 13, 2.5, 2.5, 'F');
        pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(99, 102, 241);
        pdf.text(isImg ? 'IMAGE' : 'PDF', cx + colW / 2, boxY + 16.5, { align: 'center' });
        pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 124, 180);
        pdf.text(isImg ? 'Preview unavailable' : 'Document', cx + colW / 2, boxY + 27, { align: 'center' });
      }

      // Prominent, always-clickable "Open" link at the bottom of the box.
      const linkY = boxY + imgMaxH - 4;
      pdf.setFillColor(99, 102, 241); pdf.roundedRect(cx + colW / 2 - 24, linkY - 5.5, 48, 7, 1.5, 1.5, 'F');
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
      pdf.textWithLink('Open document', cx + colW / 2, linkY - 0.8, { align: 'center', url });
      // Make the whole cell clickable too.
      pdf.link(cx, boxY, colW, imgMaxH, { url });
    }
  }

  // Final pass: draw the footer on every page so "Page X / Y" totals are correct.
  const totalPages = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawFooter();
  }

  pdf.save(`InsureSAAS_Comparison_${quote.reference}.pdf`);
}
