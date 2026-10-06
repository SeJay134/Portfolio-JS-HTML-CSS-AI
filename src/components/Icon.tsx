import React from "react";
export function Icon({
  name,
  size = 20,
}: {
  name: "menu" | "close" | "arrow" | "chat" | "send" | "github" | "spark";
  size?: number;
}) {
  const paths = {
    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    chat: <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z" />,
    send: <path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />,
    github: (
      <>
        <path d="M9 21v-4c-4 1-4-2-5-3m11 7v-4c0-1-.3-2-1-2 4-.5 6-2 6-6 0-1-.3-2-1-3 0-1 0-2-.3-3-2 0-3 1-4 1a14 14 0 0 0-6 0C8 3 7 2 5 3c-.3 1-.3 2 0 3-1 1-1 2-1 3 0 4 2 5.5 6 6-1 0-1 1-1 2" />
      </>
    ),
    spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
