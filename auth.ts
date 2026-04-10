import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'mgrv.company'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? ''
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false
      return true
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
