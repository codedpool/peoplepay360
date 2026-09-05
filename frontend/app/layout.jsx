export const metadata = {
  title: "PeoplePay360",
  description: "HR & Payroll platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
