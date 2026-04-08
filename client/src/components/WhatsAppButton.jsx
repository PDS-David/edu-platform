// WhatsAppButton.jsx
// Drop this component into your main layout or App.jsx, outside the <Routes> block

const WhatsAppButton = () => {
  const phoneNumber = "2348099123412"; // +234 809 912 3412 in international format
  const message = encodeURIComponent("Hi! I'd like to know more about the EAC Learning Platform.");
  const whatsappURL = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <a
      href={whatsappURL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        width: "56px",
        height: "56px",
        borderRadius: "50%",
        backgroundColor: "#25D366",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        textDecoration: "none",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
      }}
      aria-label="Contact us on WhatsApp"
      title="Chat with us on WhatsApp"
    >
      {/* WhatsApp SVG icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        width="30"
        height="30"
        fill="white"
      >
        <path d="M16.003 2C8.28 2 2 8.28 2 16.003c0 2.478.65 4.812 1.783 6.838L2 30l7.363-1.76A13.94 13.94 0 0 0 16.003 30C23.72 30 30 23.72 30 16.003 30 8.28 23.72 2 16.003 2zm0 25.538a11.49 11.49 0 0 1-5.86-1.6l-.42-.25-4.37 1.045 1.075-4.258-.275-.437A11.47 11.47 0 0 1 4.538 16c0-6.32 5.147-11.465 11.465-11.465S27.465 9.68 27.465 16c0 6.32-5.147 11.538-11.462 11.538zm6.29-8.61c-.345-.173-2.04-1.006-2.357-1.12-.315-.115-.545-.173-.775.173-.23.345-.89 1.12-1.09 1.35-.2.23-.4.258-.745.086-.345-.173-1.456-.537-2.773-1.712-1.025-.915-1.717-2.044-1.918-2.39-.2-.344-.02-.53.15-.702.155-.155.345-.402.518-.603.172-.2.23-.345.345-.575.115-.23.058-.432-.03-.603-.086-.173-.775-1.87-1.062-2.56-.28-.672-.564-.58-.775-.59-.2-.01-.43-.012-.66-.012-.23 0-.603.086-.918.432-.315.345-1.205 1.178-1.205 2.873s1.233 3.335 1.405 3.564c.173.23 2.428 3.707 5.882 5.198.823.355 1.464.567 1.965.727.825.263 1.577.226 2.17.137.662-.1 2.04-.833 2.328-1.637.287-.805.287-1.494.2-1.637-.086-.144-.315-.23-.66-.402z" />
      </svg>
    </a>
  );
};

export default WhatsAppButton;
