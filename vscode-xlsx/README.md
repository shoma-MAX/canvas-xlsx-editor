# Canvas XLSX Editor

VS Codeデスクトップで `.xlsx` を直接開いて編集する拡張機能です。Canvas描画と、ファイルごとに独立したWeb Worker / Rust WASMエンジンを使用します。

[Powered by ibisOffice](https://github.com/ibisjp/ibis-office)。非公式の派生プロジェクトです。AGPL-3.0-only。ライセンス本文と追加の帰属条件は [LICENSE](LICENSE)、[NOTICE](NOTICE) を参照してください。

## インストール

`release/canvas-xlsx-editor-0.1.0.vsix` を VS Code の「拡張機能: VSIXからのインストール」で選び、ローカルの `.xlsx` を開きます。他のエディタが起動する場合は「エディターを再度開く」から Canvas XLSX Editor を選びます。Marketplaceへの公開はしていません。

## 操作

- セル選択: クリック、矢印キー。範囲選択: ドラッグ、Shift+クリック/矢印。
- セル編集: ダブルクリック、F2、文字入力。Enter/Tabで確定、Escapeで中止。先頭 `=` は数式、先頭 `'` は文字列です。
- 書式: 上部の太字、文字色、背景色、文字揃え、数値形式。
- 数式バー: 表示専用。左のセル番地に `A1000` などを入力してEnterで移動。
- コピー/貼り付け: Cmd/Ctrl+C/V。外部はTSV、同じブック内は値・数式・基本書式を保持し、相対参照を調整。
- 右クリック: 行列の挿入/削除/サイズ変更、シート追加/名前変更/削除、選択範囲のソート、値フィルター。シートタブはドラッグで並べ替え。
- 検索: ツールバー、またはグリッド上でCmd/Ctrl+F。現在のシート/ブック全体。置換は文字列定数だけが対象。「最初の一致」は検索範囲の最初の該当セル内の最初の一致です。
- 保存/Undo/Redo: VS Code標準の保存・履歴機構。ツールバーにもUndo/Redoがあります。
- 下部で50〜200%ズーム。最大1,048,576行×16,384列を、サイズを制限した標準スクロール領域に対応付けます。

## 保持と制限

**0.1.0は初期版です。** 対応範囲と検証結果は [docs/validation.md](docs/validation.md) を参照してください。

- 図形、ピボット、外部リンク、マクロ、署名、コメント、テーブル、結合、条件付き書式、入力規則、保護、未知のシート要素等は保守的に読み取り専用にします。これらの描画はしません。書式定義のないブックも上流の保存制限により読み取り専用です。
- 数式または結合セルのあるブックはソート不可。未対応関数はエラーとして表示し、元の数式を保持します。Excel完全互換ではありません。
- 保存は `Source::save()` 後に再読込し、変更対象以外のZIPパーツを展開後バイト列で比較。一時ファイルに書き込み・同期後に同一ディレクトリ内で置換します。外部変更をハッシュで検出して上書きを拒否します。最後の比較と置換の間の競合や、電源断・ファイルシステム障害まで保証するものではありません。
- バックアップはVS CodeのCustom Editor APIに対応。復元時のUndo履歴は引き継ぎません。
- ZIP展開量256MiB、10,000エントリー、シートあたり100万セル、単一取得/編集範囲10万セルの安全上限があります。圧縮ファイルサイズによる一律制限はありません。ワークブックはWASM内に保持するため、大規模ファイルには相応のメモリが必要です。
- ローカル `file:` URIが対象。VS Code Web、Remote環境、独立した分割編集は対象外です。
- 枠固定は仕様書で未決定のため追加していません。

## 開発

Node.js 22以降、Rust stable、`wasm-bindgen-cli 0.2.130` が必要です。WASMバインディングとCLIのバージョンは一致させます。

```sh
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm ci
npm run build:wasm
npm run check
npm run build
python3 test/fixture.py
npm test
mkdir -p release
npm run package
```

`dist/`、WASM、VSIXは生成物です。拡張機能には `dist/` とライセンス・READMEだけを含め、ソースはフォークリポジトリで提供します。上流crateは同じチェックアウトからパス依存し、GPUIを含む本体ワークスペースとは別にビルドします。

元の仕様書: [docs/spec.md](docs/spec.md)。設計/実測: [docs/validation.md](docs/validation.md)。
