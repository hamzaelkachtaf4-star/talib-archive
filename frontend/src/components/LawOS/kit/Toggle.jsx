export default function Toggle({ checked, onChange, label, ...rest }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} className="law-toggle" onClick={() => onChange?.(!checked)} {...rest}>
      <span />
    </button>
  );
}
