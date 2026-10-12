package io.swagger.annotations;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface ApiModelProperty { String value() default ""; boolean required() default false; }
