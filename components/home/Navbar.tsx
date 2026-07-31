export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-8 py-6">
      <h2 className="text-2xl font-bold">
        HireIQ
      </h2>

      <div className="flex gap-6">
        <a href="#">Home</a>
        <a href="#">Features</a>
        <a href="#">Pricing</a>
        <a href="#">Contact</a>
      </div>
    </nav>
  );
}
