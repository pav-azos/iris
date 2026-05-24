// Auth removed — ÍRIS is open access (academic project for I2A2 InsurMinds RAG course)
// CustomSignIn is a no-op stub since Clerk is not used

type CustomSignInProps = {
    redirectUrl?: string;
    onClose?: () => void;
};

export const CustomSignIn = ({ onClose }: CustomSignInProps) => {
    return null;
};
