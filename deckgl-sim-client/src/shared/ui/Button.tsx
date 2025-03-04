import React, { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // Add any custom props you want to use in addition to standard button props
  variant?: "primary" | "secondary" | "outlined";
  size?: "small" | "medium" | "large";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { children, className, variant = "primary", size = "medium", ...props },
    ref,
  ) => {
    const variantClasses = {
      primary: "bg-slate-500 hover:bg-slate-700 text-white",
      secondary: "bg-green-500 hover:bg-green-700 text-white",
      outlined:
        "bg-transparent border border-blue-500 text-blue-500 hover:bg-blue-50 hover:border-blue-700 hover:text-blue-700",
    };

    const sizeClasses = {
      small: "px-2 py-1 text-sm",
      medium: "px-4 py-2 text-base",
      large: "px-6 py-3 text-lg",
    };

    return (
      <button
        {...props} // Inherits all button props (onClick, disabled, type, etc.)
        className={`
          rounded-md
          font-medium
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className || ""}  // Allow overriding classes
        `}
        ref={ref} // Forward the ref to the underlying button element
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button"; // Recommended for better debugging

export default Button;
