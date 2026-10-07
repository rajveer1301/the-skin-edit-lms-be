import { IsOptional, IsString, MinLength } from 'class-validator';

export class ParameterTemplateFieldDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  unit?: string;
}
