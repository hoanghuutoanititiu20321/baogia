const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PYTHON_BIN = process.platform === 'win32' ? 'python' : 'python3';

/**
 * Parse a "Data báo giá.xlsx" buffer or file path using Python's built-in zipfile + ElementTree.
 */
function parseCatalogExcelFile(filePath) {
  const pyScript = `
import sys, json, zipfile, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')

xlsx_path = sys.argv[1]
with zipfile.ZipFile(xlsx_path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss_tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        for si in ss_tree.findall('s:si', ns):
            texts = [t.text for t in si.findall('.//s:t', ns) if t.text]
            shared.append(''.join(texts))

    def parse_sheet(sheet_xml_path):
        if sheet_xml_path not in z.namelist():
            return {}
        stree = ET.fromstring(z.read(sheet_xml_path))
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        rows = {}
        for row in stree.findall('.//s:row', ns):
            r_num = int(row.attrib.get('r'))
            row_dict = {}
            for c in row.findall('s:c', ns):
                ref = c.attrib.get('r')
                col = ''.join([ch for ch in ref if ch.isalpha()])
                ctype = c.attrib.get('t')
                v = c.find('s:v', ns)
                val = v.text if v is not None else None
                if ctype == 's' and val is not None:
                    val = shared[int(val)].strip()
                elif ctype == 'inlineStr':
                    is_t = c.findall('.//s:t', ns)
                    val = ''.join([t.text for t in is_t if t.text]).strip()
                elif val is not None:
                    try:
                        fval = float(val)
                        val = int(fval) if fval.is_integer() else fval
                    except:
                        pass
                row_dict[col] = val
            rows[r_num] = row_dict
        return rows

    s1 = parse_sheet('xl/worksheets/sheet1.xml')
    s2 = parse_sheet('xl/worksheets/sheet2.xml')
    s3 = parse_sheet('xl/worksheets/sheet3.xml')

models = []
cur_prod = None
max_r = max(list(s1.keys()) + list(s2.keys()) + [2])
for r in range(3, max_r + 1):
    r1 = s1.get(r, {})
    r2 = s2.get(r, {})
    if not r1.get('B') and not r2.get('B'):
        continue
    if r1.get('A'):
        cur_prod = str(r1['A']).strip()
    elif r2.get('A'):
        cur_prod = str(r2['A']).strip()
    model_code = str(r1.get('B') or r2.get('B') or '')
    flow_m3_min = float(r1.get('C') or r2.get('C') or 0)
    tc = int(r1.get('D') or 0)
    tb = int(r2.get('D') or (tc * 2))
    fc = int(r1.get('H') or 0)
    fb = int(r2.get('H') or (fc * 2))
    pc = int(r1.get('J') or 0)
    pb = int(r2.get('J') or (pc * 2))
    pnc = int(r1.get('K') or 0)
    pnb = int(r2.get('K') or (pnc * 2))
    sc = int(r1.get('L') or 0)
    sb = int(r2.get('L') or (sc * 2))
    mc = int(r1.get('M') or round((tc + fc + pc + pnc + sc) * 0.05))
    mb = int(r2.get('M') or round((tb + fb + pb + pnb + sb) * 0.05))
    tot_c = int(r1.get('N') or (tc + fc + pc + pnc + sc + mc))
    tot_b = int(r2.get('N') or (tb + fb + pb + pnb + sb + mb))
    models.append({
        'product_line': cur_prod,
        'model_code': model_code,
        'flow_rate': flow_m3_min,
        'flow_cmh': round(flow_m3_min * 60),
        'tower_cost': tc,
        'tower_base': tb,
        'fan_model': str(r1.get('E') or r2.get('E') or ''),
        'motor_kw': float(r1.get('F') or r2.get('F') or 0),
        'fan_pressure_pa': int(r1.get('G') or r2.get('G') or 0),
        'fan_cost': fc,
        'fan_base': fb,
        'pump_model': str(r1.get('I') or r2.get('I') or ''),
        'pump_cost': pc,
        'pump_base': pb,
        'panel_cost': pnc,
        'panel_base': pnb,
        'stage_cost': sc,
        'stage_base': sb,
        'mgmt_cost': mc,
        'mgmt_base': mb,
        'total_cost': tot_c,
        'total_base': tot_b
    })

instruments = []
max_r3 = max(list(s3.keys()) + [1])
for r in range(2, max_r3 + 1):
    re_row = s3.get(r, {})
    name_vi = re_row.get('B')
    if not name_vi:
        continue
    price = re_row.get('C', None)
    instruments.append({
        'name_vi': str(name_vi).strip(),
        'base_price': int(price) if price is not None else None
    })

print(json.dumps({'models': models, 'instruments': instruments}, ensure_ascii=False))
`;

  const out = execFileSync(PYTHON_BIN, ['-c', pyScript, filePath], { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(out.trim());
}

/**
 * Generate a 3-sheet .xlsx Buffer from current database models & instruments
 */
function buildCatalogExcelBuffer(models, instruments) {
  const tmpInput = path.join(os.tmpdir(), `kkvn_export_${Date.now()}.json`);
  const tmpOutput = path.join(os.tmpdir(), `kkvn_catalog_${Date.now()}.xlsx`);
  fs.writeFileSync(tmpInput, JSON.stringify({ models, instruments }), 'utf-8');

  const pyScript = `
import sys, json, zipfile
from xml.sax.saxutils import escape

data = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
models = data['models']
instruments = data['instruments']
out_path = sys.argv[2]

def col_letter(n):
    res = ''
    while n > 0:
        n, r = divmod(n - 1, 26)
        res = chr(65 + r) + res
    return res

def build_sheet_xml(rows_data):
    lines = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    for r_idx, row in enumerate(rows_data, 1):
        lines.append(f'<row r="{r_idx}">')
        for c_idx, val in enumerate(row, 1):
            if val is None or val == '':
                continue
            ref = f'{col_letter(c_idx)}{r_idx}'
            if isinstance(val, (int, float)):
                lines.append(f'<c r="{ref}"><v>{val}</v></c>')
            else:
                s = escape(str(val))
                lines.append(f'<c r="{ref}" t="inlineStr"><is><t>{s}</t></is></c>')
        lines.append('</row>')
    lines.append('</sheetData></worksheet>')
    return ''.join(lines)

header1 = ['Sản Phẩm', '', '', 'HỆ THÁP', 'Quạt', '', '', '', 'Bơm', '', 'Tủ điện', 'Hệ sắt Stage', 'Chi phí quản lý, thiết kế', 'Tổng giá', '', '* Lưu ý :', '- Thiết bị đi kèm gồm : Đo mức tuần hoàn + hóa chất (SUS, cơ) x2, van điện từ (brass) x1, đồng hồ chênh áp (cơ) x1']
header2 = ['Tên dòng', 'Model', 'Lưu lượng', '', 'Dòng quạt', 'Motor', 'Áp suất quạt', 'Thành tiền', 'Dòng bơm', 'Thành tiền', '', '', '', '', '', '', '- Báo giá chưa bao gồm chi phí vận chuyển, chi phí lắp đặt.']

s1_rows = [header1, header2]
s2_rows = [header1, header2]

last_prod = None
for m in models:
    prod_cell = m['product_line'] if m['product_line'] != last_prod else ''
    last_prod = m['product_line']
    s1_rows.append([
        prod_cell, m['model_code'], m['flow_rate'], m['tower_cost'],
        m['fan_model'], m['motor_kw'], m['fan_pressure_pa'], m['fan_cost'],
        m['pump_model'], m['pump_cost'],
        m['panel_cost'], m['stage_cost'], m['mgmt_cost'], m['total_cost']
    ])
    s2_rows.append([
        prod_cell, m['model_code'], m['flow_rate'], m['tower_base'],
        m['fan_model'], m['motor_kw'], m['fan_pressure_pa'], m['fan_base'],
        m['pump_model'], m['pump_base'],
        m['panel_base'], m['stage_base'], m['mgmt_base'], m['total_base']
    ])

s3_rows = [['STT', 'Tên thiết bị đo', 'Thành tiền', 'Giá Cost (Nội bộ)', 'Ghi chú gói cơ bản']]
for idx, eq in enumerate(instruments, 1):
    s3_rows.append([
        idx,
        eq['name_vi'],
        eq['base_price'] if eq['base_price'] is not None else '',
        eq['cost_price'] if eq['cost_price'] is not None else '',
        f"Đã gồm mặc định x{eq['default_qty']}" if eq.get('is_default_included') else 'Tùy chọn cộng thêm'
    ])

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>'''

rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Data báo giá cost" sheetId="1" r:id="rId1"/>
    <sheet name="Data báo giá cơ bản" sheetId="2" r:id="rId2"/>
    <sheet name="Danh sách tất cả thiết bị đo" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>'''

wb_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>'''

with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('_rels/.rels', rels)
    z.writestr('xl/workbook.xml', workbook)
    z.writestr('xl/_rels/workbook.xml.rels', wb_rels)
    z.writestr('xl/worksheets/sheet1.xml', build_sheet_xml(s1_rows))
    z.writestr('xl/worksheets/sheet2.xml', build_sheet_xml(s2_rows))
    z.writestr('xl/worksheets/sheet3.xml', build_sheet_xml(s3_rows))
`;

  execFileSync(PYTHON_BIN, ['-c', pyScript, tmpInput, tmpOutput]);
  const buf = fs.readFileSync(tmpOutput);
  try {
    fs.unlinkSync(tmpInput);
    fs.unlinkSync(tmpOutput);
  } catch {}
  return buf;
}

module.exports = {
  parseCatalogExcelFile,
  buildCatalogExcelBuffer
};
