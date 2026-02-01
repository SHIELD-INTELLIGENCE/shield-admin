import "../global.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>Shield Admin Dashboard</title>
      </head>
      <body>{children}</body>
    </html>
  );
}