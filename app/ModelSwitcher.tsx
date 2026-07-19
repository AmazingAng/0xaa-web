export type SiteModel = "gpt-5-6-terra" | "fable-5";

type ModelSwitcherProps = {
  activeModel: SiteModel;
  label: string;
};

const modelPages: Array<{
  id: SiteModel;
  href: string;
  primary: string;
  secondary: string;
}> = [
  { id: "gpt-5-6-terra", href: "/gpt-5-6-Terra", primary: "GPT-5.6", secondary: "TERRA" },
  { id: "fable-5", href: "/fable-5", primary: "CLAUDE", secondary: "FABLE 5" },
];

export default function ModelSwitcher({ activeModel, label }: ModelSwitcherProps) {
  const active = modelPages.find((model) => model.id === activeModel) ?? modelPages[0];

  return (
    <details className="model-switcher">
      <summary aria-label={label}>
        <span className="model-switcher-label">MODEL</span>
        <span className="model-switcher-current">
          <b>{active.primary}</b>
          <em>{active.secondary}</em>
        </span>
        <i aria-hidden="true">⌄</i>
      </summary>
      <nav className="model-switcher-menu" aria-label={label}>
        {modelPages.map((model) => (
          <a
            key={model.id}
            href={model.href}
            aria-current={model.id === activeModel ? "page" : undefined}
            data-active={model.id === activeModel}
          >
            <span>{model.primary}</span>
            <em>{model.secondary}</em>
          </a>
        ))}
      </nav>
    </details>
  );
}
