<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.8 }}
  className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#a18cd1] via-[#cde7ff] to-white animate-gradient"
>
  <motion.div
    initial={{ scale: 0.95, opacity: 0, y: 20 }}
    animate={{ scale: 1, opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="text-center bg-white/60 backdrop-blur-md shadow-lg rounded-2xl p-10 w-full max-w-md"
  >
    <h1 className="text-3xl font-bold text-[#4b0082] mb-2">
      Welcome Back 👋
    </h1>
    <p className="text-gray-700 mb-8">Sign in to continue</p>

    {error && (
      <p className="text-red-700 mb-4 font-medium text-center">{error}</p>
    )}

    <form onSubmit={handleLogin} className="space-y-4">
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
        {loading ? 'Logging in...' : 'Login'}
      </motion.button>
    </form>

    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => router.push('/signup')}
      className="mt-6 w-full text-[#4b0082] hover:underline font-semibold"
    >
      Sign Up
    </motion.button>
  </motion.div>
</motion.div>