/** At least one letter and one digit; length bounds are enforced separately. */
export const PASSWORD_LETTER_AND_DIGIT = /^(?=.*[A-Za-z])(?=.*\d)[\s\S]+$/;

export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter entre 8 e 72 bytes e conter pelo menos uma letra e um dígito';

export function assertPasswordPolicy(password: string): void {
  const passwordLength = Buffer.byteLength(password, 'utf8');
  if (
    passwordLength < 8 ||
    passwordLength > 72 ||
    !PASSWORD_LETTER_AND_DIGIT.test(password)
  ) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
}
