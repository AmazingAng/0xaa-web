import type { Metadata } from "next";
import FableExperience from "./FableExperience";

export const metadata: Metadata = {
  title: "0xAA / Fable 5 — Synapse Bloom",
  description:
    "The Claude Fable 5 node in the 0xAA model archive: ignite twelve synapses to wake the network, then read the unfinished fable.",
  robots: { index: false, follow: false },
};

export default function FablePage() {
  return <FableExperience />;
}
