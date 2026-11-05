import zipfile, pathlib
root=pathlib.Path(__file__).parent
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
parts={
'[Content_Types].xml':'''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>''',
'_rels/.rels':'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>''',
'xl/workbook.xml':f'''<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="売上" sheetId="1" r:id="rId1"/></sheets></workbook>''',
'xl/_rels/workbook.xml.rels':'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>''',
'xl/worksheets/sheet1.xml':f'''<worksheet xmlns="{ns}"><dimension ref="A1:C4"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>品目</t></is></c><c r="B1" t="inlineStr"><is><t>売上</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>りんご</t></is></c><c r="B2"><v>10</v></c><c r="C2"><f>B2*2</f><v>20</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>みかん</t></is></c><c r="B3"><v>5</v></c></row><row r="4"><c r="B4"><f>SUM(B2:B3)</f><v>15</v></c></row></sheetData></worksheet>''',
'custom/preserved.xml':'<custom xmlns="urn:example" x="keep"> untouched <!-- comment --> </custom>'}
parts['xl/styles.xml']=f'''<styleSheet xmlns="{ns}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'''
parts['[Content_Types].xml']=parts['[Content_Types].xml'].replace('</Types>','<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
parts['xl/_rels/workbook.xml.rels']=parts['xl/_rels/workbook.xml.rels'].replace('</Relationships>','<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
for name,extra in [('basic.xlsx',{}),('advanced.xlsx',{'xl/drawings/drawing1.xml':'<drawing />'})]:
 with zipfile.ZipFile(root/name,'w',zipfile.ZIP_DEFLATED) as z:
  for path,data in (parts|extra).items():z.writestr(path,data)
