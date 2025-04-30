import AuthForm from "../_components/authForm";

export default function AuthPage() {
  return (
    <div className="w-full h-screen pb-32 flex justify-center items-center">
      <div>
        <h1 className="text-4xl text-white font-bold text-center">Ready to rock?</h1>
        <AuthForm />
      </div>
    </div>
  );
}
