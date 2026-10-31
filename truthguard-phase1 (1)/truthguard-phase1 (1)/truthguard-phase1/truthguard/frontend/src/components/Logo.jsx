export function Logo({ size = 22, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        d="M16 3L5 7.5V15C5 21.8 9.7 28.1 16 29.5C22.3 28.1 27 21.8 27 15V7.5L16 3Z"
        fill="#295255"
        stroke="#162623"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 5.5L7.2 9.3V15C7.2 20.6 11 25.7 16 26.9C21 25.7 24.8 20.6 24.8 15V9.3L16 5.5Z"
        fill="#162623"
        opacity="0.3"
      />
      <path
        d="M11 15.5L14.5 19L21 12.5"
        stroke="#F0F5F7"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
