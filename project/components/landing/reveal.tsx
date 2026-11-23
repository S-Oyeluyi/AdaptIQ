"use client"

import { motion, type HTMLMotionProps } from "motion/react"
import { EASE_OUT } from "./landing-config"

type RevealProps = HTMLMotionProps<"div"> & { delay?: number; y?: number }

export function Reveal({ delay = 0, y = 24, children, ...props }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
