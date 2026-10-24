import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

// Direction-aware arrows (RC2 4.1). Source layout is RTL; `.law-flip` mirrors in LTR. Forward points along the reading
// direction (left in Arabic, right in French/English), Back points against it. Never type ← or → inside a string.
export const Forward = (props) => <ArrowLeft size={16} aria-hidden="true" className="law-flip inline-block align-middle" {...props} />;
export const Back = (props) => <ArrowRight size={16} aria-hidden="true" className="law-flip inline-block align-middle" {...props} />;
