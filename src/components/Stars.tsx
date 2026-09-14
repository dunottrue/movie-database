interface Props {
  value: number;
  max?: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md";
  title?: string;
}

export default function Stars({ value, max = 10, onChange, size = "sm", title }: Props) {
  const inp = [...Array(max).keys()].map((i) => i + 1);
  return (
    <span className={`stars ${size}`} title={title}>
      {inp.map((v) => (
        <span
          key={v}
          className={`star ${v <= Math.round(value) ? "on" : ""}`}
          onClick={onChange ? (e) => { e.stopPropagation(); onChange(v); } : undefined}
        >
          <svg width={size === "md" ? 22 : 15} height={size === "md" ? 22 : 15} viewBox="0 0 24 24">
            <path d="M12 2l2.9 6.26 6.86.6-5.2 4.52 1.56 6.72L12 16.9l-6.12 3.2 1.56-6.72-5.2-4.52 6.86-.6z" />
          </svg>
        </span>
      ))}
    </span>
  );
}