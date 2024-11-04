import { forwardRef, ReactNode } from "react";

export interface DialogProps {
  open: boolean,
  type?: "info" | "confirmation"
  content: ReactNode
  className?: string
}

const Dialog = forwardRef<HTMLDivElement, DialogProps>(({
  open = false,
  type = "info",
  content,
  className,
  ...props
}, ref) => {

  console.log(props)

  return (
    <div
      ref={ref}
      className=""
    >

    </div>
  )
}) 

export default Dialog
