// SPDX-License-Identifier: AGPL-3.0-only
use ibis_doc_model::sheet::{CellAlign, CellRange, CellValue};
use ibis_doc_model::sheet_calc::sheet_of_slide;
use ibis_doc_model::sheet_command::{
    Axis, CellEdit, CellInput, PutCell, SheetCommand, StyleChange,
};
use ibis_doc_model::{Command, Document, Sheet, SlideId};
use ibis_ooxml::{Package, zip::Archive};
use ibis_pptx::{SaveOptions, Source};
use serde_json::{Value, json};
use std::sync::Arc;
use wasm_bindgen::prelude::*;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
const MAX_EXPANDED: usize = 256 * 1024 * 1024;
const MAX_RANGE: u64 = 100_000;

// Limits are checked before the OOXML reader expands any part.
fn preflight(bytes: &[u8]) -> Result<Option<String>, String> {
    let archive = Archive::new(Arc::from(bytes)).map_err(err)?;
    if archive.entries().len() > 10_000 {
        return Err("ZIPエントリー数が安全上限を超えています".into());
    }
    let mut total = 0usize;
    let mut reason = if archive.entries().iter().any(|e| e.name == "xl/styles.xml") {
        None
    } else {
        Some("書式定義のないブックは上流で保存できないため読み取り専用です".into())
    };
    for e in archive.entries() {
        total = total.checked_add(e.size).ok_or("ZIPサイズが不正です")?;
        if total > MAX_EXPANDED {
            return Err("ZIP展開量が256MiBの安全上限を超えています".into());
        }
        if e.name.contains("drawings/")
            || e.name.contains("pivot")
            || e.name.contains("externalLinks/")
            || e.name.contains("vbaProject")
            || e.name.contains("_xmlsignatures/")
            || e.name.contains("comments")
            || e.name.contains("tables/")
            || e.name.contains("connections")
        {
            reason = Some("図形・ピボット・外部参照・署名等を含むため読み取り専用です".into());
        }
        if e.name.starts_with("xl/worksheets/") && e.name.ends_with(".xml") {
            let xml = archive.read(e).map_err(err)?;
            let xml = std::str::from_utf8(&xml).map_err(err)?;
            let tree = roxmltree::Document::parse(xml).map_err(err)?;
            let cells = tree.descendants().filter(|n| n.has_tag_name("c")).count();
            if cells > 1_000_000 {
                return Err("シートのセル数が安全上限を超えています".into());
            }
            for n in tree.descendants().filter(|n| n.is_element()) {
                let supported = [
                    "worksheet",
                    "dimension",
                    "sheetViews",
                    "sheetView",
                    "pane",
                    "selection",
                    "sheetFormatPr",
                    "cols",
                    "col",
                    "sheetData",
                    "row",
                    "c",
                    "v",
                    "f",
                    "is",
                    "t",
                    "r",
                    "rPr",
                    "b",
                    "i",
                    "u",
                    "sz",
                    "rFont",
                    "color",
                    "family",
                    "scheme",
                    "phoneticPr",
                    "rPh",
                    "sheetPr",
                    "outlinePr",
                    "pageSetUpPr",
                    "pageMargins",
                    "pageSetup",
                    "printOptions",
                    "headerFooter",
                    "oddHeader",
                    "oddFooter",
                    "evenHeader",
                    "evenFooter",
                    "firstHeader",
                    "firstFooter",
                    "sheetCalcPr",
                    "autoFilter",
                    "filterColumn",
                    "filters",
                    "filter",
                    "sortState",
                    "sortCondition",
                ];
                if !supported.contains(&n.tag_name().name())
                    || n.tag_name().namespace()
                        != Some("http://schemas.openxmlformats.org/spreadsheetml/2006/main")
                {
                    reason = Some("未検証のシート機能を含むため読み取り専用です".into());
                }

                if matches!(
                    n.tag_name().name(),
                    "mergeCells"
                        | "sheetProtection"
                        | "conditionalFormatting"
                        | "dataValidations"
                        | "extLst"
                        | "drawing"
                        | "legacyDrawing"
                ) {
                    reason = Some("未検証のシート機能を含むため読み取り専用です".into());
                }
            }
        }
    }
    Ok(reason)
}

#[wasm_bindgen]
pub struct Engine {
    doc: Document,
    source: Source,
    original: Vec<u8>,
    readonly: Option<String>,
    clipboard: Option<(String, u32, u32, Vec<PutCell>)>,
}
impl Engine {
    fn load(bytes: &[u8]) -> Result<Self, String> {
        let mut readonly = preflight(bytes)?;
        let opened = ibis_pptx::open(bytes.to_vec()).map_err(err)?;
        if opened
            .presentation
            .workbook
            .as_ref()
            .is_some_and(|w| w.protection.is_some())
        {
            readonly = Some("保護されたブックは読み取り専用です".into());
        }
        if opened.presentation.workbook.is_none() {
            return Err("XLSXブックではありません".into());
        }
        Ok(Self {
            doc: Document::new(opened.presentation),
            source: opened.source,
            original: bytes.to_vec(),
            readonly,
            clipboard: None,
        })
    }
    fn slide(&self, index: usize) -> Result<SlideId, String> {
        self.doc
            .presentation()
            .slides
            .iter()
            .filter(|s| sheet_of_slide(s).is_some())
            .nth(index)
            .map(|s| s.id)
            .ok_or("シートがありません".into())
    }
    fn sheet(&self, index: usize) -> Result<&Sheet, String> {
        let slide = self.slide(index)?;
        Ok(sheet_of_slide(self.doc.presentation().slide(slide).unwrap()).unwrap())
    }
    fn metadata(&self) -> Value {
        let sheets: Vec<_> = self.doc.presentation().slides.iter().filter_map(|s| sheet_of_slide(s).map(|sh| json!({"name":s.name,"rows":sh.rows.len().max(1000),"columns":sh.columns.len().max(26),"defaultRow":(sh.default_row as f64/9525.0).max(1.0),"defaultColumn":(sh.default_column as f64/9525.0).max(1.0),"rowSizes":sh.rows.iter().enumerate().filter(|(i,h)|**h!=sh.default_row || sh.filtered_rows.contains(&(*i as u32))).map(|(i,h)|(i,if sh.filtered_rows.contains(&(i as u32)){0.0}else{*h as f64/9525.0})).collect::<Vec<_>>(),"columnSizes":sh.columns.iter().enumerate().filter(|(_,w)|**w!=sh.default_column).map(|(i,w)|(i,*w as f64/9525.0)).collect::<Vec<_>>()}))).collect();
        json!({"sheets":sheets,"readonly":self.readonly,"undo":self.doc.undo_len(),"canUndo":self.doc.can_undo(),"canRedo":self.doc.can_redo()})
    }
    fn apply(&mut self, commands: Vec<Command>) -> Result<(), String> {
        if let Some(reason) = &self.readonly {
            return Err(reason.clone());
        }
        self.doc.execute(commands).map_err(err)
    }
    fn handle(&mut self, v: Value) -> Result<Value, String> {
        let op = v["op"].as_str().ok_or("opがありません")?;
        if op == "info" {
            return Ok(self.metadata());
        }
        if op == "undo" || op == "redo" {
            if self.readonly.is_some() {
                return Err("読み取り専用です".into());
            }
            if op == "undo" {
                self.doc.undo();
            } else {
                self.doc.redo();
            }
            return Ok(self.metadata());
        }
        let index = v["sheet"].as_u64().unwrap_or(0) as usize;
        let slide = self.slide(index)?;
        if op == "range" {
            let (r, c, rows, cols) = (
                uint(&v, "row")?,
                uint(&v, "column")?,
                uint(&v, "rows")?,
                uint(&v, "columns")?,
            );
            if u64::from(rows) * u64::from(cols) > MAX_RANGE {
                return Err("取得範囲が大きすぎます".into());
            }
            let s = self.sheet(index)?;
            let mut cells = Vec::new();
            for cell in s.cells.iter().filter(|x| {
                x.row >= r
                    && x.row < r.saturating_add(rows)
                    && x.column >= c
                    && x.column < c.saturating_add(cols)
            }) {
                let style = s
                    .styles
                    .get(cell.style as usize)
                    .cloned()
                    .unwrap_or_default();
                cells.push(json!({"row":cell.row,"column":cell.column,"text":cell.text,"input":cell.formula.as_ref().map(|f|format!("={f}")).unwrap_or_else(||value_input(&cell.value)),"bold":style.bold,"color":format!("#{:06x}",style.color.0),"fill":style.fill.map(|c|format!("#{:06x}",c.0)),"align":format!("{:?}",style.align),"format":style.number_format,"error":matches!(cell.value,CellValue::Error(_))}));
            }
            return Ok(json!({"cells":cells}));
        }
        if op == "search" {
            let query = v["query"].as_str().ok_or("検索文字列がありません")?;
            let all = v["all"].as_bool().unwrap_or(false);
            let mut results = Vec::new();
            for (i, sl) in self
                .doc
                .presentation()
                .slides
                .iter()
                .filter(|s| sheet_of_slide(s).is_some())
                .enumerate()
            {
                if !all && i != index {
                    continue;
                }
                for cell in sheet_of_slide(sl).unwrap().cells.iter() {
                    if cell.text.contains(query) && results.len() < 1000 {
                        results.push(
                            json!({"sheet":i,"row":cell.row,"column":cell.column,"text":cell.text}),
                        );
                    }
                }
            }
            return Ok(json!({"results":results,"limit":1000}));
        }
        if op == "copy" {
            let range = range(&v)?;
            let sh = self.sheet(index)?;
            let mut lines = Vec::new();
            let mut copied = Vec::new();
            for r in range.first_row..=range.last_row {
                let mut line = Vec::new();
                for c in range.first_column..=range.last_column {
                    let cell = sh.cell(r, c);
                    let text = cell.map(|c| c.text.as_str()).unwrap_or("");
                    line.push(if text.contains(['\t', '\n', '\r', '"']) {
                        format!("\"{}\"", text.replace('"', "\"\""))
                    } else {
                        text.to_string()
                    });
                    copied.push(PutCell {
                        row: r,
                        column: c,
                        input: cell
                            .map(|c| {
                                c.formula
                                    .as_ref()
                                    .map(|f| CellInput::Formula(f.clone()))
                                    .unwrap_or_else(|| CellInput::Value(c.value.clone()))
                            })
                            .unwrap_or(CellInput::Clear),
                        style: Some(
                            cell.and_then(|c| sh.styles.get(c.style as usize))
                                .cloned()
                                .unwrap_or_default(),
                        ),
                    });
                }
                lines.push(line.join("\t"));
            }
            let text = lines.join("\n");
            self.clipboard = Some((text.clone(), range.first_row, range.first_column, copied));
            return Ok(json!({"text":text}));
        }
        let command = match op {
            "pasteInternal" => {
                let (text, r, c, cells) = self
                    .clipboard
                    .as_ref()
                    .ok_or("内部コピー情報がありません")?;
                if v["text"].as_str() != Some(text) {
                    return Err("クリップボードの内容が変更されています".into());
                }
                let row = coordinate(&v, "row", 1048576)?;
                let column = coordinate(&v, "column", 16384)?;
                let dr = i64::from(row) - i64::from(*r);
                let dc = i64::from(column) - i64::from(*c);
                if cells.iter().any(|cell| {
                    i64::from(cell.row) + dr >= 1048576 || i64::from(cell.column) + dc >= 16384
                }) {
                    return Err("貼り付け範囲がExcelの上限を超えています".into());
                }
                let cells = cells
                    .iter()
                    .map(|cell| {
                        let mut cell = cell.clone();
                        cell.row = (i64::from(cell.row) + dr) as u32;
                        cell.column = (i64::from(cell.column) + dc) as u32;
                        if let CellInput::Formula(f) = &mut cell.input {
                            *f = ibis_calc::formula::shift(f, dr, dc);
                        }
                        cell
                    })
                    .collect();
                SheetCommand::PutCells { slide, cells }
            }
            "insert" | "delete" => {
                let axis = if v["axis"] == "rows" {
                    Axis::Rows
                } else {
                    Axis::Columns
                };
                let at = coordinate(&v, "at", if axis == Axis::Rows { 1048576 } else { 16384 })?;
                if op == "insert"
                    && self.sheet(index)?.cells.iter().any(|c| {
                        if axis == Axis::Rows {
                            c.row >= 1048575
                        } else {
                            c.column >= 16383
                        }
                    })
                {
                    return Err("挿入でセルがExcelの範囲外に押し出されるため中止しました".into());
                }
                if op == "insert" {
                    SheetCommand::Insert {
                        slide,
                        axis,
                        at,
                        count: 1,
                    }
                } else {
                    SheetCommand::Delete {
                        slide,
                        axis,
                        at,
                        count: 1,
                    }
                }
            }
            "size" => {
                let axis = if v["axis"] == "rows" {
                    Axis::Rows
                } else {
                    Axis::Columns
                };
                let at = coordinate(&v, "at", if axis == Axis::Rows { 1048576 } else { 16384 })?;
                let pixels = v["pixels"]
                    .as_f64()
                    .filter(|n| n.is_finite() && *n >= 1.0 && *n <= 4096.0)
                    .ok_or("サイズは1〜4096pxを指定してください")?;
                SheetCommand::SetSize {
                    slide,
                    axis,
                    first: at,
                    last: at,
                    size: (pixels * 9525.0) as i64,
                }
            }
            "addSheet" => {
                let name = v["name"]
                    .as_str()
                    .ok_or("シート名がありません")?
                    .to_string();
                let id = self.doc.ids().new_slide_id();
                let shape = self.doc.ids().new_shape_id();
                SheetCommand::AddSheet {
                    index: index + 1,
                    name,
                    slide: id,
                    shape,
                }
            }
            "renameSheet" => SheetCommand::RenameSheet {
                slide,
                name: v["name"].as_str().ok_or("シート名がありません")?.into(),
            },
            "deleteSheet" => SheetCommand::DeleteSheet { slide },
            "moveSheet" => SheetCommand::MoveSheet {
                slide,
                to: uint(&v, "to")? as usize,
            },
            "sort" => {
                let range = range(&v)?;
                let sh = self.sheet(index)?;
                if !sh.merges.is_empty()
                    || self
                        .doc
                        .presentation()
                        .slides
                        .iter()
                        .filter_map(|s| sheet_of_slide(s))
                        .any(|s| s.cells.iter().any(|c| c.formula.is_some()))
                {
                    return Err("数式または結合セルを含むブックのソートは無効です".into());
                }
                let column = uint(&v, "sortColumn")?;
                if column < range.first_column || column > range.last_column {
                    return Err("ソート列が範囲外です".into());
                }
                SheetCommand::Sort {
                    slide,
                    range,
                    keys: vec![(column, v["ascending"].as_bool().unwrap_or(true))],
                    header: v["header"].as_bool().unwrap_or(false),
                }
            }
            "filter" => {
                use ibis_doc_model::sheet::{AutoFilter, ColumnFilter};
                let filter = if v["clear"].as_bool().unwrap_or(false) {
                    None
                } else {
                    let range = range(&v)?;
                    let column = uint(&v, "filterColumn")?;
                    if column < range.first_column || column > range.last_column {
                        return Err("フィルター列が範囲外です".into());
                    }
                    let values = v["values"]
                        .as_array()
                        .ok_or("値がありません")?
                        .iter()
                        .map(|v| v.as_str().unwrap_or("").to_string())
                        .collect();
                    let mut columns = self
                        .sheet(index)?
                        .auto_filter
                        .as_ref()
                        .filter(|f| f.range == range)
                        .map(|f| f.columns.clone())
                        .unwrap_or_default();
                    columns.retain(|(c, _)| *c != column - range.first_column);
                    columns.push((column - range.first_column, ColumnFilter::Values(values)));
                    Some(AutoFilter { range, columns })
                };
                SheetCommand::SetAutoFilter { slide, filter }
            }
            "set" => {
                let entries = v["cells"].as_array().ok_or("cellsがありません")?;
                if entries.len() > MAX_RANGE as usize {
                    return Err("編集範囲が大きすぎます".into());
                }
                let edits = entries
                    .iter()
                    .map(|x| {
                        Ok(CellEdit {
                            row: coordinate(x, "row", 1048576)?,
                            column: coordinate(x, "column", 16384)?,
                            input: input(x["input"].as_str().ok_or("入力が不正です")?),
                        })
                    })
                    .collect::<Result<Vec<_>, String>>()?;
                SheetCommand::SetCells { slide, edits }
            }
            "format" => {
                let range = range(&v)?;
                let val = v["value"].as_str().unwrap_or("");
                let change = match v["kind"].as_str().unwrap_or("") {
                    "bold" => StyleChange::Bold(v["value"].as_bool().unwrap_or(true)),
                    "color" => StyleChange::Color(rgb(val)?),
                    "fill" => StyleChange::Fill(Some(rgb(val)?)),
                    "align" => StyleChange::Align(match val {
                        "center" => CellAlign::Center,
                        "right" => CellAlign::Right,
                        _ => CellAlign::Left,
                    }),
                    "number" => StyleChange::NumberFormat(val.into()),
                    _ => return Err("未対応の書式です".into()),
                };
                SheetCommand::SetFormat {
                    slide,
                    ranges: vec![range],
                    change,
                }
            }
            "replace" => {
                let from = v["query"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .ok_or("検索文字列がありません")?;
                let to = v["replacement"].as_str().ok_or("置換文字列がありません")?;
                let all = v["all"].as_bool().unwrap_or(false);
                let one = v["one"].as_bool().unwrap_or(false);
                let mut commands = Vec::new();
                let mut count = 0;
                for (i, sl) in self
                    .doc
                    .presentation()
                    .slides
                    .iter()
                    .filter(|s| sheet_of_slide(s).is_some())
                    .enumerate()
                {
                    if !all && i != index {
                        continue;
                    }
                    let edits: Vec<_> = sheet_of_slide(sl)
                        .unwrap()
                        .cells
                        .iter()
                        .filter_map(|c| {
                            if c.formula.is_some()
                                || !matches!(c.value, CellValue::Text(_))
                                || (one && count > 0)
                            {
                                return None;
                            }
                            if let CellValue::Text(text) = &c.value {
                                if text.contains(from) {
                                    count += 1;
                                    return Some(CellEdit {
                                        row: c.row,
                                        column: c.column,
                                        input: CellInput::Value(CellValue::Text(if one {
                                            text.replacen(from, to, 1)
                                        } else {
                                            text.replace(from, to)
                                        })),
                                    });
                                }
                            }
                            None
                        })
                        .collect();
                    if !edits.is_empty() {
                        commands.push(Command::Sheet(SheetCommand::SetCells {
                            slide: sl.id,
                            edits,
                        }));
                    }
                }
                if !commands.is_empty() {
                    self.apply(commands)?;
                }
                return Ok(json!({"count":count}));
            }
            // Structural changes stay disabled until reference/merge preservation has dedicated round-trip coverage.
            _ => return Err("この操作は保持性の検証が完了していないため無効です".into()),
        };
        self.apply(vec![Command::Sheet(command)])?;
        Ok(self.metadata())
    }
    fn bytes(&self) -> Result<Vec<u8>, String> {
        if self.readonly.is_some() {
            return Ok(self.original.clone());
        }
        let bytes = self
            .source
            .save(self.doc.presentation(), SaveOptions::default())
            .map_err(err)?;
        preflight(&bytes)?;
        // Every untouched package part must survive byte-for-byte when decompressed.
        let before = Package::open(self.original.clone()).map_err(err)?;
        let after = Package::open(bytes.clone()).map_err(err)?;
        for name in before.names() {
            let mutable = name.starts_with("xl/worksheets/") && name.ends_with(".xml")
                || matches!(
                    name,
                    "xl/styles.xml"
                        | "xl/workbook.xml"
                        | "xl/calcChain.xml"
                        | "xl/_rels/workbook.xml.rels"
                        | "[Content_Types].xml"
                );
            if !mutable
                && (!after.contains(name)
                    || before.read(name).map_err(err)? != after.read(name).map_err(err)?)
            {
                return Err(format!("未編集パーツの保持検証に失敗: {name}"));
            }
        }
        ibis_pptx::open(bytes.clone()).map_err(err)?;
        Ok(bytes)
    }
}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<Engine, JsError> {
        Self::load(bytes).map_err(|s| JsError::new(&s))
    }
    pub fn request(&mut self, json: &str) -> Result<String, JsError> {
        let before = self.doc.undo_len();
        let result = serde_json::from_str(json)
            .map_err(err)
            .and_then(|v| self.handle(v))
            .and_then(|mut v| {
                v["changed"] = json!(self.doc.undo_len() != before);
                serde_json::to_string(&v).map_err(err)
            });
        result.map_err(|s| JsError::new(&s))
    }
    pub fn save(&self) -> Result<Vec<u8>, JsError> {
        self.bytes().map_err(|s| JsError::new(&s))
    }
}
fn uint(v: &Value, k: &str) -> Result<u32, String> {
    v[k].as_u64()
        .and_then(|n| u32::try_from(n).ok())
        .ok_or(format!("{k}が不正です"))
}
fn range(v: &Value) -> Result<CellRange, String> {
    let r = CellRange {
        first_row: uint(v, "row")?,
        last_row: uint(v, "lastRow")?,
        first_column: uint(v, "column")?,
        last_column: uint(v, "lastColumn")?,
    };
    if r.last_row >= 1048576
        || r.last_column >= 16384
        || r.last_row < r.first_row
        || r.last_column < r.first_column
        || u64::from(r.last_row - r.first_row + 1) * u64::from(r.last_column - r.first_column + 1)
            > MAX_RANGE
    {
        return Err("範囲が不正または大きすぎます".into());
    }
    Ok(r)
}
fn rgb(s: &str) -> Result<ibis_doc_model::Rgb, String> {
    if s.len() != 7 || !s.starts_with('#') {
        return Err("色が不正です".into());
    }
    u32::from_str_radix(&s[1..], 16)
        .map(ibis_doc_model::Rgb)
        .map_err(err)
}
fn input(s: &str) -> CellInput {
    if let Some(f) = s.strip_prefix('=') {
        CellInput::Formula(f.into())
    } else if let Some(t) = s.strip_prefix('\'') {
        CellInput::Value(CellValue::Text(t.into()))
    } else if s.is_empty() {
        CellInput::Clear
    } else if s.eq_ignore_ascii_case("true") || s.eq_ignore_ascii_case("false") {
        CellInput::Value(CellValue::Bool(s.eq_ignore_ascii_case("true")))
    } else if let Ok(n) = s.parse::<f64>() {
        if n.is_finite() {
            CellInput::Value(CellValue::Number(n))
        } else {
            CellInput::Value(CellValue::Text(s.into()))
        }
    } else {
        CellInput::Value(CellValue::Text(s.into()))
    }
}
fn value_input(v: &CellValue) -> String {
    match v {
        CellValue::Empty => String::new(),
        CellValue::Text(t) => t.clone(),
        CellValue::Number(n) => n.to_string(),
        CellValue::Bool(b) => if *b { "TRUE" } else { "FALSE" }.into(),
        CellValue::Error(e) => format!("{e:?}"),
    }
}

fn coordinate(v: &Value, k: &str, max: u32) -> Result<u32, String> {
    let n = uint(v, k)?;
    if n >= max {
        return Err("Excelの最大行列を超えています".into());
    }
    Ok(n)
}
