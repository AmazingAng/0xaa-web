import type { Metadata } from "next";
import FableExperience from "./FableExperience";

export const metadata: Metadata = {
  title: "0xAA / Fable 5 — 0xAA WORLD",
  description:
    "The Claude Fable 5 node in the 0xAA model archive: a side-scrolling platformer where the homepage is the level — bump the ? blocks, stomp the noise, reach the flag.",
  robots: { index: false, follow: false },
};

export default function FablePage() {
  return <FableExperience />;
}
