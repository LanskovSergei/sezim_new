import { useState } from "react";

type Props = {
  name: string;
  /** Фото; если его нет или оно не загрузилось — показываем инициалы. */
  src?: string;
  size?: "small" | "normal";
};

const TONES = ["#2f5d50", "#c46b3a", "#5b6b9a", "#8a5a12", "#7a4e6b", "#3f6f8a"];

function tone(name: string): string {
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return TONES[sum % TONES.length];
}

/** Аватар психолога или клиента с запасным вариантом из инициалов. */
export function Avatar({ name, src, size = "normal" }: Props) {
  const [failed, setFailed] = useState(false);
  const cls = `avatar ${size === "small" ? "small" : ""}`;
  if (src && !failed) {
    return <img className={cls} src={src} alt="" onError={() => setFailed(true)} />;
  }
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`${cls} initials`} style={{ background: tone(name), color: "#fffcf7" }} aria-hidden="true">
      {initials}
    </span>
  );
}
