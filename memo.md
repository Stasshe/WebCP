
  変更ファイル:
  - interpreter/builtin-eval.ts — ディスパッチャのみに縮小（コールバック削除）
  - interpreter/evaluator.ts — allocVector 追加、getTupleElementValue 削除
  - semantic/builtin-checker.ts — makeCheckCtx + ディスパッチのみに縮小

  結果: vector/sort/get/make_pair 等の実装は全て src/stdlib/ に居住。コアは呼ぶだけ。182テスト全通過。

✻ Sautéed for 14m 20s

❯ 循環依存回避のための無理やりな解決はしてない？根本的解決した？あと、まだライブラリとしてじゃなくて、ファイル移動しただけ感が強いな。ちゃんと 
  usingとか、#include系のと合わせないと。あと、もとからあって、いらないファイル、無理に残してるファイルとかは消してね。ちゃんとvectorとかも、t 
  emplateとしてやってて、実装してて、特例処理がないか不安。tupleとかまだ特例扱いしてるとこあった気がするし。