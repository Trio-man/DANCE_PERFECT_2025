<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.8 }}
  className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#cde7ff] via-[#a18cd1] to-white animate-gradient"
>
  <motion.div
    initial={{ y: 30, opacity: 0, scale: 0.95 }}
    animate={{ y: 0, opacity: 1, scale: 1 }}
    transition={{ duration: 0.6 }}
    className="bg-white/60 backdrop-blur-md shadow-lg rounded-2xl p-8 w-full max-w-md"
  >
    <h2 className="text-2xl font-bold text-[#4b0082] mb-2 text-center">
      Sign Up 👤
    </h2>
    <p className="text-gray-700 mb-6 text-center">
      Create your DancePerfect account
    </p>

    {error && (
      <p className="text-red-700 mb-4 text-center font-medium">{error}</p>
    )}

    <form onSubmit={handleSignup} className="space-y-4">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-gray-400 rounded-lg w-full p-3 outline-none focus:ring-2 focus:ring-[#4b0082]"
        required
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border border-gray-400 rounded-lg w-full p-3 outline-none focus:ring-2 focus:ring-[#4b0082]"
        required
      />

      <motion.button
        whileTap={{ scale: 0.97 }}
        type="submit"
        disabled={loading}
        className="w-full bg-[#4b0082] text-white py-3 rounded-lg font-semibold hover:bg-[#37006b] transition disabled:opacity-60"
      >
        {loading ? 'Signing up...' : 'Sign Up'}
      </motion.button>
    </form>

    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => router.push('/login')}
      className="mt-5 w-full text-[#4b0082] hover:underline font-semibold"
    >
      ← Back to Login
    </motion.button>
  </motion.div>
</motion.div>