import { SMTPServer } from 'smtp-server';
import { simpleParser, type ParsedMail } from 'mailparser';

/** Lokalny serwer SMTP przechwytujący wiadomości (do testów). */
export async function startSmtp(port = 0) {
  const messages: ParsedMail[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _s, cb) {
      cb(null, { user: auth.username });
    },
    onData(stream, _s, cb) {
      simpleParser(stream).then((m) => {
        messages.push(m);
        cb();
      }, cb);
    },
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
  const addr = (server as any).server.address();
  return { port: addr.port as number, messages, close: () => new Promise<void>((r) => server.close(() => r())) };
}
