// แยกข้อมูลจากข้อความที่ OCR อ่านได้จากสลิปโอนเงิน
(function (root) {
  const TH_MONTHS = [
    ['ม.ค', 'มกราคม'], ['ก.พ', 'กุมภาพันธ์'], ['มี.ค', 'มีนาคม'], ['เม.ย', 'เมษายน'],
    ['พ.ค', 'พฤษภาคม'], ['มิ.ย', 'มิถุนายน'], ['ก.ค', 'กรกฎาคม'], ['ส.ค', 'สิงหาคม'],
    ['ก.ย', 'กันยายน'], ['ต.ค', 'ตุลาคม'], ['พ.ย', 'พฤศจิกายน'], ['ธ.ค', 'ธันวาคม'],
  ];
  const EN_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const TITLE_RE = /(นางสาว|น\.ส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|MRS\.?|MR\.?|MS\.?|MISS)\s*/i;
  const MONEY_RE = /(\d{1,3}(?:[,，]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;

  function toArabic(s) {
    return s.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
  }

  function clean(text) {
    return toArabic(text).replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  function moneyIn(line) {
    const out = [];
    let m; MONEY_RE.lastIndex = 0;
    while ((m = MONEY_RE.exec(line))) {
      out.push(parseFloat(m[1].replace(/[,，]/g, '') + '.' + m[2]));
    }
    return out;
  }

  function findAmount(lines) {
    const amountKey = /(จำนวนเงิน|จํานวนเงิน|จำนวน|จํานวน|ยอดเงิน|ยอดโอน|amount|฿|บาท|THB)/i;
    const feeKey = /(ค่าธรรมเนียม|คาธรรมเนียม|fee|คงเหลือ|balance)/i;
    for (let i = 0; i < lines.length; i++) {
      if (amountKey.test(lines[i]) && !feeKey.test(lines[i])) {
        const v = moneyIn(lines[i]).filter(n => n > 0);
        if (v.length) return v[0];
        // ตัวเลขอาจอยู่บรรทัดถัดไป
        if (lines[i + 1] && !feeKey.test(lines[i + 1])) {
          const v2 = moneyIn(lines[i + 1]).filter(n => n > 0);
          if (v2.length) return v2[0];
        }
      }
    }
    // สำรอง: ตัวเลขทศนิยม 2 ตำแหน่งที่มากที่สุด ไม่นับบรรทัดค่าธรรมเนียม/เลขบัญชี
    let best = null;
    for (const l of lines) {
      if (feeKey.test(l) || /x{2,}|X{2,}|\d{3}-\d/.test(l)) continue;
      for (const n of moneyIn(l)) if (n > 0 && (best === null || n > best)) best = n;
    }
    return best;
  }

  function normYear(y) {
    y = parseInt(y, 10);
    if (y < 100) y += 2500;          // 69 -> 2569
    if (y > 2400) y -= 543;          // พ.ศ. -> ค.ศ.
    return y;
  }

  function findDate(lines) {
    const text = lines.join(' ');
    const squashed = text.replace(/\s+/g, '');
    let day, month, year;
    for (let i = 0; i < 12 && month === undefined; i++) {
      for (const name of [TH_MONTHS[i][1], TH_MONTHS[i][0]]) {
        const esc = name.replace(/\./g, '\\.?');
        const re = new RegExp('(\\d{1,2})' + esc + '\\.?(25\\d{2}|20\\d{2}|\\d{2})');
        const m = squashed.match(re);
        if (m) { day = +m[1]; month = i; year = normYear(m[2]); break; }
      }
    }
    if (month === undefined) {
      const re = /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{2,4})/i;
      const m = text.match(re);
      if (m) { day = +m[1]; month = EN_MONTHS.indexOf(m[2].toLowerCase()); year = parseInt(m[3], 10); if (year < 100) year += 2000; if (year > 2400) year -= 543; }
    }
    if (month === undefined) {
      const m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) { day = +m[1]; month = +m[2] - 1; year = normYear(m[3].length === 2 && +m[3] < 50 ? '20' + m[3] : m[3]); }
    }
    let hh = 12, mm = 0;
    for (const t of text.matchAll(/(\d{1,2}):(\d{2})/g)) {
      if (+t[1] < 24 && +t[2] < 60) { hh = +t[1]; mm = +t[2]; break; }
    }
    if (month === undefined || !(day >= 1 && day <= 31) || !(year > 2000 && year < 2100)) return null;
    return new Date(year, month, day, hh, mm).getTime();
  }

  function findNames(lines) {
    const names = [];
    for (const l of lines) {
      const m = l.match(TITLE_RE);
      if (m) {
        const name = l.slice(m.index).replace(/\s+/g, ' ').trim();
        if (name.length > 3) names.push(name);
      }
    }
    return names;
  }

  function normName(s) {
    return (s || '').replace(new RegExp(TITLE_RE.source, 'gi'), '').replace(/[\s.]/g, '').toLowerCase();
  }

  // เปรียบเทียบชื่อจากสลิปกับชื่อของเรา (ใช้ชื่อจริง 3 ตัวอักษรแรกขึ้นไป เพราะสลิปมักย่อนามสกุล)
  function isMe(slipName, myNames) {
    const s = normName(slipName);
    return myNames.some(n => {
      const first = normName(n.trim().split(/\s+/).filter(w => !TITLE_RE.test(w + ' '))[0] || n);
      return first.length >= 3 && s.includes(first.slice(0, Math.max(3, first.length)));
    });
  }

  function parseSlip(text, myNames) {
    const lines = clean(text);
    const names = findNames(lines);
    const after = re => { const i = lines.findIndex(l => re.test(l)); return i >= 0 && lines[i + 1] ? lines[i + 1] : ''; };
    const sender = names[0] || after(/^(จาก|ผู้โอน|From)(\s|:|$)/i);
    const receiver = names[1] || after(/^(ไปยัง|ไปที่|ผู้รับ|ถึง|To)(\s|:|$)/i);
    let type = 'out', other = receiver;
    const mine = (myNames || []).filter(Boolean);
    if (mine.length) {
      if (receiver && isMe(receiver, mine) && !isMe(sender, mine)) { type = 'in'; other = sender; }
    }
    return {
      amount: findAmount(lines),
      ts: findDate(lines),
      type,
      sender, receiver,
      note: other,
    };
  }

  const api = { parseSlip, findAmount, findDate, findNames, isMe };
  if (typeof module !== 'undefined') module.exports = api; else root.SlipParse = api;
})(this);
