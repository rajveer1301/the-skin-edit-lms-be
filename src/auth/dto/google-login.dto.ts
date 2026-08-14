import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  /** The Google ID token (JWT credential) returned by Google Identity Services. */
  @IsString()
  @MinLength(10)
  credential!: string;
}
