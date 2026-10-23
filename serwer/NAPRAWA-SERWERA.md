# Dlaczego strona „zacina się” na serwerze vbox.pl i jak to naprawić

Diagnoza z 23.10.2026, wykonana dla `anetakunc.vbox.pl` i `roboclean.vbox.pl` (ten sam serwer, Plesk + nginx + Apache).

## Co jest nie tak

| Problem | Pomiar | Skutek dla odwiedzającego |
|---|---|---|
| **Serwer seriami odpowiada `502 Bad Gateway`** | przy jednym przejściu po 74 plikach strony 9 zwróciło 502; jeden font zwrócił 502 sześć razy z rzędu; raz cała strona główna dała 502 | brak zdjęć, fontu, stylów lub skryptów, strona „szarpie”, czasem zamiast strony widać błąd 502 |
| Pliki statyczne idą przez Apache | 502 to standardowa strona błędu nginx: nginx nie mógł połączyć się z Apache | każda chwilowa przerwa Apache wybija zdjęcia i fonty |
| Brak nagłówków pamięci podręcznej | `.htaccess` nie działa, bo pliki obsługuje nginx; brak `Cache-Control`/`Expires` | przy każdej wizycie przeglądarka pyta serwer o wszystko od nowa |
| Tylko HTTP/1.1 | serwer nie oferuje HTTP/2 | pliki pobierane w kolejce po kilka naraz, ok. 0,5 s na żądanie |
| Niepełny łańcuch certyfikatu SSL | serwer wysyła tylko certyfikat `*.vbox.pl`, bez pośredniego „GlobalSign GCC R6 AlphaSSL CA 2025” | część przeglądarek i aplikacji (np. przeglądarka w Messengerze, starsze Androidy, narzędzia) pokaże błąd bezpieczeństwa |

Przewijanie samej strony Roboclean jest płynne (60 kl./s). Problemem jest serwer, nie kod tej strony.

## Jak naprawić (Plesk, ok. 10 minut)

1. **Pliki statyczne bez Apache + pamięć podręczna.**
   Plesk → Strony WWW i domeny → `anetakunc.vbox.pl` → **Ustawienia Apache i nginx** → pole **„Dodatkowe dyrektywy nginx”** → wklej zawartość pliku [`nginx-plesk.conf`](nginx-plesk.conf) → OK.
   To samo możesz zrobić dla `roboclean.vbox.pl` (zmień tylko nazwę pliku startowego, jeśli inna).
   Alternatywa: w tych samych ustawieniach zaznacz „Serwuj pliki statyczne bezpośrednio przez nginx”.
2. **Przyczyna 502.** Sprawdź log: Plesk → domena → **Logi** → filtr „błąd”, albo plik `/var/www/vhosts/system/anetakunc.vbox.pl/logs/proxy_error_log`. Najczęstsze przyczyny to przeciążony lub restartujący się Apache (limit procesów, pamięć) albo reguły ModSecurity/fail2ban.
3. **HTTP/2.** Plesk → Narzędzia i ustawienia → Ustawienia Apache i nginx (lub Optymalizacja) → włącz HTTP/2.
4. **Certyfikat SSL.** Plesk → domena → **Certyfikaty SSL/TLS** → przy certyfikacie `*.vbox.pl` uzupełnij pole „Certyfikat CA” certyfikatem pośrednim *GlobalSign GCC R6 AlphaSSL CA 2025* (do pobrania od GlobalSign: `https://secure.globalsign.com/cacert/gsgccr6alphasslca2025.crt`, format DER, przed wklejeniem zamień na PEM). Kontrola: https://www.ssllabs.com/ssltest/ powinno pokazać „Chain issues: None”.

## Co już zabezpiecza sama strona

Niezależnie od serwera strona Anety sama radzi sobie z chwilowymi błędami:

- style, skrypty, zdjęcia i fonty są automatycznie pobierane ponownie (do 6 prób);
- wszystkie skrypty są w jednym pliku `app.js` (1 żądanie zamiast 5);
- podstrona pobiera się już przy najechaniu na link, a przed przejściem strona sprawdza, czy serwer odpowiada.

Test na serwerze testowym, który seriami odpowiadał 502 (ostrzej niż vbox.pl): poprzednia wersja miała uszkodzone 46 z 84 zdjęć i działający JS w 0 z 6 wejść; nowa wersja: 0 uszkodzonych zdjęć w 70, JS i style w 6 z 6.

Pierwszego wejścia nie da się zabezpieczyć po stronie przeglądarki: jeśli serwer zwróci 502 na sam adres strony, odwiedzający zobaczy błąd. To naprawia tylko punkt 1 i 2.
