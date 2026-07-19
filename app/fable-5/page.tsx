import type { Metadata } from "next";
import ModelSwitcher from "../ModelSwitcher";

export const metadata: Metadata = {
  title: "0xAA / Fable 5",
  description: "The reserved Fable 5 home in the 0xAA model archive.",
  robots: { index: false, follow: false },
};

export default function FableReservePage() {
  return (
    <main className="model-reserve">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-noise" aria-hidden="true" />

      <header className="monolith-header model-reserve-header">
        <a className="monolith-mark" href="/gpt-5-6-Terra" aria-label="前往 GPT-5.6 Terra 主页">
          <span>0xAA</span>
          <i aria-hidden="true" />
        </a>
        <div className="header-links">
          <ModelSwitcher activeModel="fable-5" label="切换模型主页" />
        </div>
      </header>

      <section className="model-reserve-shell" aria-labelledby="fable-heading">
        <p className="model-reserve-kicker">0xAA / MODEL ARCHIVE</p>
        <h1 id="fable-heading">FABLE <em>5.</em></h1>
        <p className="model-reserve-copy">Claude Fable 正在构建这颗节点。</p>
        <a className="primary-action model-reserve-action" href="/gpt-5-6-Terra">
          GPT-5.6 TERRA <span aria-hidden="true">↗</span>
        </a>
      </section>
    </main>
  );
}
